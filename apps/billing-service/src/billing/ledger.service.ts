/**
 * LedgerService — 复式记账实现
 *
 * 职责：
 *  1. 在数据库事务中执行积分操作（避免余额不一致）
 *  2. 使用 SELECT ... FOR UPDATE 悲观锁锁定用户行
 *  3. 写入 PointTransaction 流水（billing 库）
 *  4. 更新 User.currentPoints / totalPoints（main 库）
 *
 * 跨库事务策略（main + billing 是同实例不同 database）：
 *  - main 库事务：锁定 User + 更新余额
 *  - billing 库：插入流水（idempotencyKey 唯一约束作为最终幂等保障）
 *  - 顺序：先 main 事务提交，再 billing 插入；若 billing 插入失败则记录关键日志
 *  - 上层 BillingService 通过 Redis 锁 + 预检查防止重复执行
 *
 * 字段约定（与 PointTransaction 实体一致）：
 *  - amount：正数=增加（CREDIT），负数=扣减（DEBIT）
 *  - balance：操作后的可用余额快照
 */
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'
import { BusinessException } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'

/** 写入流水所需的最小参数 */
export interface WriteTransactionParams {
  userId: string
  type: PointTransactionType
  /** 带符号的金额（正=增加，负=扣减） */
  amount: number
  /** 操作后可用余额 */
  balanceAfter: number
  idempotencyKey: string
  description: string
  workId?: string | null
  orderId?: string | null
}

/** 流水写入结果 */
export interface WriteTransactionResult {
  transaction: PointTransaction
  user: User
}

/** 用户余额快照 */
export interface BalanceSnapshot {
  userId: string
  balance: number
  total: number
}

/** 聚合查询结果 */
interface FrozenAggregate {
  frozen: number
}

/**
 * 复式记账服务
 *
 * 不直接对外暴露，由 BillingService 调用。
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @InjectDataSource(DATABASE_CONNECTIONS.BILLING)
    private readonly billingDataSource: DataSource,
  ) {}

  // -------------------- 查询：悲观锁读取用户 --------------------

  /**
   * 在事务中悲观锁读取用户行
   * @param manager main 库事务 EntityManager
   * @param userId 用户 ID
   */
  async lockUser(manager: EntityManager, userId: string): Promise<User> {
    const repo = manager.getRepository(User)
    const user = await repo
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne()

    if (!user) {
      throw BusinessException.notFound('用户', { userId })
    }
    return user
  }

  // -------------------- 查询：聚合冻结余额 --------------------

  /**
   * 计算用户当前冻结余额
   *
   * frozen = SUM(FREEZE.amount) - SUM(SETTLE.amount + RELEASE.amount)
   * 注：amount 在实体中带符号，FREEZE 为负、SETTLE 为负、RELEASE 为正。
   * 这里统一按"被冻结的总量"语义聚合：frozen = -SUM(FREEZE) - (-SUM(SETTLE)) - SUM(RELEASE)
   *
   * 简化：frozen = SUM(amount WHERE type IN (FREEZE)) * -1 + SUM(amount WHERE type IN (SETTLE)) + SUM(amount WHERE type IN (RELEASE)) * -1
   * 实际 SQL：SUM(CASE WHEN type='FREEZE' THEN -amount WHEN type='SETTLE' THEN -amount WHEN type='RELEASE' THEN amount ELSE 0 END)
   */
  async getFrozenBalance(userId: string): Promise<number> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const result = await repo
      .createQueryBuilder('tx')
      .select(
        'COALESCE(SUM(CASE WHEN tx.type = :freeze THEN -tx.amount WHEN tx.type = :settle THEN -tx.amount WHEN tx.type = :release THEN tx.amount ELSE 0 END), 0)',
        'frozen',
      )
      .setParameter('freeze', PointTransactionType.FREEZE)
      .setParameter('settle', PointTransactionType.SETTLE)
      .setParameter('release', PointTransactionType.RELEASE)
      .where('tx.userId = :userId', { userId })
      .getRawOne<FrozenAggregate>()

    return Number(result?.frozen ?? 0)
  }

  // -------------------- 查询：通过幂等键查流水 --------------------

  /**
   * 通过幂等键查询已存在的流水（用于幂等返回）
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<PointTransaction | null> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    return repo.findOne({ where: { idempotencyKey } })
  }

  /**
   * 通过 ID 查询单笔流水
   */
  async findById(id: string, userId?: string): Promise<PointTransaction | null> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const where: Record<string, unknown> = { id }
    if (userId) {
      where.userId = userId
    }
    return repo.findOne({ where })
  }

  // -------------------- 写入：流水记录 --------------------

  /**
   * 写入一条流水记录（billing 库）
   *
   * 由各业务方法在 main 库事务提交后调用。
   * 若 idempotencyKey 已存在（唯一约束冲突），抛出 QueryFailedError，由调用方处理。
   */
  async writeTransaction(params: WriteTransactionParams): Promise<PointTransaction> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const entity = repo.create({
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      balance: params.balanceAfter,
      workId: params.workId ?? null,
      orderId: params.orderId ?? null,
      idempotencyKey: params.idempotencyKey,
      description: params.description || '',
    })
    return repo.save(entity)
  }

  // -------------------- 业务操作：FREEZE --------------------

  /**
   * 冻结积分
   *
   * 逻辑：
   *  - 悲观锁锁定 User
   *  - 校验 currentPoints >= amount
   *  - currentPoints -= amount
   *  - 写入 FREEZE 流水（amount = -N, balance = currentPoints）
   *
   * @returns freezeId（= 流水 ID）、balance（操作后可用余额）、frozen（操作后冻结余额）
   */
  async freeze(params: {
    userId: string
    amount: number
    idempotencyKey: string
    workId?: string | null
    description?: string
  }): Promise<{ freezeId: string; balance: number; frozen: number; tx: PointTransaction }> {
    const { userId, amount, idempotencyKey, workId, description } = params

    return this.mainDataSource.transaction(async (manager) => {
      // 1. 悲观锁读取用户
      const user = await this.lockUser(manager, userId)

      // 2. 余额校验
      if (user.currentPoints < amount) {
        throw BusinessException.insufficientCredits(
          `积分不足：当前可用 ${user.currentPoints}，需要 ${amount}`,
          { current: user.currentPoints, required: amount },
        )
      }

      // 3. 扣减可用余额
      const newBalance = user.currentPoints - amount
      user.currentPoints = newBalance
      await manager.getRepository(User).save(user)

      // 4. 写入流水（先在事务内尝试，billing 库不在 main 事务中，需独立插入）
      const tx = await this.writeTransaction({
        userId,
        type: PointTransactionType.FREEZE,
        amount: -amount, // 负数：扣减
        balanceAfter: newBalance,
        idempotencyKey,
        description: description || `冻结 ${amount} 积分`,
        workId: workId ?? null,
      })

      // 5. 计算冻结后余额（FREEZE 后冻结 += amount）
      const frozen = await this.getFrozenBalance(userId)

      return {
        freezeId: tx.id,
        balance: newBalance,
        frozen,
        tx,
      }
    })
  }

  // -------------------- 业务操作：SETTLE --------------------

  /**
   * 结算冻结积分
   *
   * 逻辑：
   *  - 校验 freezeId 对应的 FREEZE 流水存在且属于该用户
   *  - 校验当前冻结余额 >= amount
   *  - 可用余额不变（已在 FREEZE 时扣减）
   *  - 写入 SETTLE 流水（amount = -amount, balance = currentBalance）
   *
   * 注意：跨库事务限制下，本方法仅插入 billing 流水，不更新 User。
   */
  async settle(params: {
    userId: string
    amount: number
    idempotencyKey: string
    freezeId: string
    workId?: string | null
    description?: string
  }): Promise<{ balance: number; frozen: number; tx: PointTransaction }> {
    const { userId, amount, idempotencyKey, freezeId, workId, description } = params

    // 1. 校验 FREEZE 流水
    const freezeTx = await this.findById(freezeId, userId)
    if (!freezeTx || freezeTx.type !== PointTransactionType.FREEZE) {
      throw BusinessException.notFound('冻结流水', {
        freezeId,
        userId,
      })
    }

    // 2. 校验冻结余额
    const currentFrozen = await this.getFrozenBalance(userId)
    if (currentFrozen < amount) {
      throw BusinessException.insufficientCredits(
        `冻结积分不足：当前冻结 ${currentFrozen}，需要 ${amount}`,
        { frozen: currentFrozen, required: amount },
      )
    }

    // 3. 读取当前可用余额（用于流水 balance 字段）
    const userRepo = this.mainDataSource.getRepository(User)
    const user = await userRepo.findOne({ where: { id: userId } })
    if (!user) {
      throw BusinessException.notFound('用户', { userId })
    }

    // 4. 写入 SETTLE 流水（可用余额不变）
    const tx = await this.writeTransaction({
      userId,
      type: PointTransactionType.SETTLE,
      amount: -amount, // 负数：表示从冻结中扣减（语义上的 DEBIT）
      balanceAfter: user.currentPoints, // 可用余额不变
      idempotencyKey,
      description: description || `结算 ${amount} 积分（freeze: ${freezeId}）`,
      workId: workId ?? freezeTx.workId,
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance: user.currentPoints,
      frozen,
      tx,
    }
  }

  // -------------------- 业务操作：RELEASE --------------------

  /**
   * 释放冻结积分
   *
   * 逻辑：
   *  - 校验 freezeId 对应的 FREEZE 流水存在且属于该用户
   *  - 校验当前冻结余额 >= amount
   *  - 悲观锁锁定 User
   *  - currentPoints += amount（返还到可用余额）
   *  - 写入 RELEASE 流水（amount = +amount, balance = currentPoints）
   */
  async release(params: {
    userId: string
    amount: number
    idempotencyKey: string
    freezeId: string
    description?: string
  }): Promise<{ balance: number; frozen: number; tx: PointTransaction }> {
    const { userId, amount, idempotencyKey, freezeId, description } = params

    // 1. 校验 FREEZE 流水
    const freezeTx = await this.findById(freezeId, userId)
    if (!freezeTx || freezeTx.type !== PointTransactionType.FREEZE) {
      throw BusinessException.notFound('冻结流水', {
        freezeId,
        userId,
      })
    }

    // 2. 校验冻结余额
    const currentFrozen = await this.getFrozenBalance(userId)
    if (currentFrozen < amount) {
      throw BusinessException.insufficientCredits(
        `冻结积分不足：当前冻结 ${currentFrozen}，需要 ${amount}`,
        { frozen: currentFrozen, required: amount },
      )
    }

    // 3. 事务内更新 User 余额
    const result = await this.mainDataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId)

      const newBalance = user.currentPoints + amount
      user.currentPoints = newBalance
      await manager.getRepository(User).save(user)

      return { user, newBalance }
    })

    // 4. 写入 RELEASE 流水
    const tx = await this.writeTransaction({
      userId,
      type: PointTransactionType.RELEASE,
      amount: +amount, // 正数：增加可用余额
      balanceAfter: result.newBalance,
      idempotencyKey,
      description: description || `释放 ${amount} 积分（freeze: ${freezeId}）`,
      workId: freezeTx.workId,
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance: result.newBalance,
      frozen,
      tx,
    }
  }

  // -------------------- 业务操作：GRANT --------------------

  /**
   * 赠送积分（套餐购买后）
   *
   * 逻辑：
   *  - 悲观锁锁定 User
   *  - currentPoints += amount
   *  - totalPoints += amount
   *  - 写入 GRANT 流水（amount = +amount, balance = currentPoints）
   */
  async grant(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    packageId: string
    description?: string
  }): Promise<{ balance: number; frozen: number; tx: PointTransaction }> {
    const { userId, amount, idempotencyKey, orderId, packageId, description } = params

    const result = await this.mainDataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId)

      const newBalance = user.currentPoints + amount
      user.currentPoints = newBalance
      user.totalPoints += amount
      await manager.getRepository(User).save(user)

      return { user, newBalance }
    })

    const tx = await this.writeTransaction({
      userId,
      type: PointTransactionType.GRANT,
      amount: +amount,
      balanceAfter: result.newBalance,
      idempotencyKey,
      description: description || `套餐赠送 ${amount} 积分（package: ${packageId}）`,
      orderId,
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance: result.newBalance,
      frozen,
      tx,
    }
  }

  // -------------------- 业务操作：CONSUME --------------------

  /**
   * 直接消费积分（不走冻结流程）
   *
   * 逻辑：
   *  - 悲观锁锁定 User
   *  - 校验 currentPoints >= amount
   *  - currentPoints -= amount
   *  - 写入 CONSUME 流水（amount = -amount, balance = currentPoints）
   */
  async consume(params: {
    userId: string
    amount: number
    idempotencyKey: string
    workId?: string | null
    description?: string
  }): Promise<{ balance: number; frozen: number; tx: PointTransaction }> {
    const { userId, amount, idempotencyKey, workId, description } = params

    const result = await this.mainDataSource.transaction(async (manager) => {
      const user = await this.lockUser(manager, userId)

      if (user.currentPoints < amount) {
        throw BusinessException.insufficientCredits(
          `积分不足：当前可用 ${user.currentPoints}，需要 ${amount}`,
          { current: user.currentPoints, required: amount },
        )
      }

      const newBalance = user.currentPoints - amount
      user.currentPoints = newBalance
      await manager.getRepository(User).save(user)

      return { user, newBalance }
    })

    const tx = await this.writeTransaction({
      userId,
      type: PointTransactionType.CONSUME,
      amount: -amount,
      balanceAfter: result.newBalance,
      idempotencyKey,
      description: description || `消费 ${amount} 积分`,
      workId: workId ?? null,
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance: result.newBalance,
      frozen,
      tx,
    }
  }
}
