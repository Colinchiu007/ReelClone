/**
 * LedgerService — 复式记账实现（V2 CreditOperation 架构）
 *
 * 职责：
 *  1. 在 main 库单一事务中执行积分操作（避免跨库不一致）
 *  2. 使用 SELECT ... FOR UPDATE 悲观锁锁定用户行
 *  3. 写入 CreditOperation 权威记录 + CreditOperationOutbox（main 库同事务）
 *  4. 更新 User.currentPoints / totalPoints（main 库同事务）
 *  5. outbox 由后续 consumer（B5）投递到 billing 库 PointTransaction
 *
 * 迁移说明（Track B2）：
 *  - FREEZE/RELEASE/GRANT/REWARD/CONSUME 全部走 CreditOperation + outbox
 *  - 删除 direct dual-write（不再在写操作中直接写 billing 库 PointTransaction）
 *  - SETTLE 保留旧版路径（仅用于历史 PointTransaction 冻结的结算）
 *  - writeTransaction 保留供 CreditReservationService 投影使用
 *
 * 字段约定：
 *  - CreditOperation.amount：GRANT/REWARD/RELEASE 为正，FREEZE/CONSUME 为负
 *  - metadata.balanceAfter：操作后可用余额快照（供幂等返回使用）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { BusinessException } from '@reelclone/common'
import {
  CreditOperation,
  CreditOperationOutbox,
  CreditOperationStatus,
  CreditOperationType,
  CreditReservation,
  CreditReservationStatus,
  DATABASE_CONNECTIONS,
  OutboxStatus,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'

/** 写入流水所需的最小参数（保留供 CreditReservationService 投影使用） */
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
  /** 关联模板 ID（REWARD 类型时填充） */
  templateId?: string | null
  /** SETTLE / RELEASE 关联的原始 FREEZE 流水 ID */
  freezeId?: string | null
  /** V2 生成预留 ID（main 库权威记录的逻辑关联） */
  reservationId?: string | null
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

/** CreditOperation 创建参数 */
interface CreateOperationParams {
  userId: string
  type: CreditOperationType
  /** 带符号的金额（GRANT/REWARD/RELEASE 为正，FREEZE/CONSUME 为负） */
  amount: number
  idempotencyKey: string
  operationId: string
  relatedOrderId?: string | null
  relatedTemplateId?: string | null
  relatedWorkId?: string | null
  requestFingerprint: string
  metadata?: Record<string, unknown> | null
}

/**
 * 复式记账服务
 *
 * 不直接对外暴露，由 BillingService 调用。
 */
@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name)

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
   * amount 在实体中带符号：FREEZE / SETTLE 为负、RELEASE 为正。
   * 因此冻结余额为 -SUM(FREEZE) + SUM(SETTLE) - SUM(RELEASE)。
   */
  async getFrozenBalance(userId: string): Promise<number> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const legacyResult = await repo
      .createQueryBuilder('tx')
      .select(
        'COALESCE(SUM(CASE WHEN tx.type = :freeze THEN -tx.amount WHEN tx.type = :settle THEN tx.amount WHEN tx.type = :release THEN -tx.amount ELSE 0 END), 0)',
        'frozen',
      )
      .setParameter('freeze', PointTransactionType.FREEZE)
      .setParameter('settle', PointTransactionType.SETTLE)
      .setParameter('release', PointTransactionType.RELEASE)
      .where('tx.userId = :userId', { userId })
      // V2 预留由 main 库权威状态计算，避免 outbox 送达延迟或重放造成重复统计。
      .andWhere('tx.reservationId IS NULL')
      .getRawOne<FrozenAggregate>()

    const reservationResult = await this.mainDataSource
      .getRepository(CreditReservation)
      .createQueryBuilder('reservation')
      .select('COALESCE(SUM(reservation.amount), 0)', 'frozen')
      .where('reservation.userId = :userId', { userId })
      .andWhere('reservation.status = :status', { status: CreditReservationStatus.OPEN })
      .getRawOne<FrozenAggregate>()

    return Number(legacyResult?.frozen ?? 0) + Number(reservationResult?.frozen ?? 0)
  }

  // -------------------- 查询：通过幂等键查流水 / 操作 --------------------

  /**
   * 通过幂等键查询已存在的流水（用于幂等返回）
   *
   * 保留供 CreditReservationService 投影双重检查使用。
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<PointTransaction | null> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    return repo.findOne({ where: { idempotencyKey } })
  }

  /**
   * 通过幂等键查询已存在的 CreditOperation（V2 幂等返回）
   */
  async findOperationByIdempotencyKey(idempotencyKey: string): Promise<CreditOperation | null> {
    const repo = this.mainDataSource.getRepository(CreditOperation)
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

  // -------------------- 写入：流水记录（保留供投影使用） --------------------

  /**
   * 写入一条流水记录（billing 库）
   *
   * 保留供 CreditReservationService.projectOutbox 投影使用。
   * V2 写操作不再调用此方法，改为写 CreditOperation + outbox。
   */
  async writeTransaction(
    params: WriteTransactionParams,
    manager?: EntityManager,
  ): Promise<PointTransaction> {
    const repo = manager
      ? manager.getRepository(PointTransaction)
      : this.billingDataSource.getRepository(PointTransaction)
    const entity = repo.create({
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      balance: params.balanceAfter,
      workId: params.workId ?? null,
      orderId: params.orderId ?? null,
      templateId: params.templateId ?? null,
      freezeId: params.freezeId ?? null,
      reservationId: params.reservationId ?? null,
      idempotencyKey: params.idempotencyKey,
      description: params.description || '',
    })
    return repo.save(entity)
  }

  // -------------------- V2 写入：CreditOperation + Outbox --------------------

  /**
   * 计算请求指纹（payload hash），与 idempotency_key 共同保证幂等。
   *
   * 相同 idempotencyKey + 不同 fingerprint 会触发唯一约束冲突，
   * 检测出幂等键复用但参数不一致的误用。
   */
  private computeRequestFingerprint(payload: Record<string, unknown>): string {
    const sorted = Object.keys(payload)
      .sort()
      .map((k) => `${k}=${payload[k] ?? ''}`)
      .join('&')
    return createHash('sha256').update(sorted).digest('hex')
  }

  /**
   * 在 main 库事务内创建 CreditOperation + CreditOperationOutbox。
   *
   * 幂等性：先按 (userId, type, idempotencyKey, requestFingerprint) 查找已有记录，
   * 存在则直接返回（不重复创建），保证同事务内余额更新与操作记录原子提交。
   */
  private async createOperationAndOutbox(
    manager: EntityManager,
    params: CreateOperationParams,
  ): Promise<CreditOperation> {
    const operationRepo = manager.getRepository(CreditOperation)
    const outboxRepo = manager.getRepository(CreditOperationOutbox)

    // 幂等：按唯一索引字段查找已有操作
    const existing = await operationRepo.findOne({
      where: {
        userId: params.userId,
        type: params.type,
        idempotencyKey: params.idempotencyKey,
        requestFingerprint: params.requestFingerprint,
      },
    })
    if (existing) {
      return existing
    }

    const operation = operationRepo.create({
      userId: params.userId,
      type: params.type,
      amount: params.amount,
      relatedOrderId: params.relatedOrderId ?? null,
      relatedTemplateId: params.relatedTemplateId ?? null,
      relatedWorkId: params.relatedWorkId ?? null,
      requestFingerprint: params.requestFingerprint,
      idempotencyKey: params.idempotencyKey,
      operationId: params.operationId,
      status: CreditOperationStatus.CONFIRMED,
      metadata: params.metadata ?? null,
    })
    const saved = await operationRepo.save(operation)

    await outboxRepo.save(
      outboxRepo.create({
        operationId: saved.operationId,
        creditOperationId: saved.id,
        status: OutboxStatus.PENDING,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        eventPayload: {
          operationId: saved.operationId,
          creditOperationId: saved.id,
          userId: saved.userId,
          type: saved.type,
          amount: saved.amount,
          relatedOrderId: saved.relatedOrderId,
          relatedTemplateId: saved.relatedTemplateId,
          relatedWorkId: saved.relatedWorkId,
          metadata: saved.metadata,
        } as Record<string, unknown>,
      }),
    )

    return saved
  }

  /**
   * 幂等检查：在事务内、修改用户余额之前查找已存在的 CreditOperation。
   *
   * B2.4: 避免重放时重复扣减/增加余额。
   * 如果已有相同 (userId, type, idempotencyKey, requestFingerprint) 的操作，
   * 直接返回该操作（含 metadata.balanceAfter），不执行任何余额变更。
   */
  private async findExistingOperation(
    manager: EntityManager,
    userId: string,
    type: CreditOperationType,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CreditOperation | null> {
    return manager.getRepository(CreditOperation).findOne({
      where: { userId, type, idempotencyKey, requestFingerprint },
    })
  }

  /** 锁定并验证一笔全额冻结预留尚未结束。 */
  private async lockOpenFreeze(
    manager: EntityManager,
    freezeId: string,
    userId: string,
    amount: number,
  ): Promise<PointTransaction> {
    const repo = manager.getRepository(PointTransaction)
    const freezeTx = await repo
      .createQueryBuilder('tx')
      .setLock('pessimistic_write')
      .where('tx.id = :freezeId', { freezeId })
      .andWhere('tx.userId = :userId', { userId })
      .andWhere('tx.type = :freezeType', { freezeType: PointTransactionType.FREEZE })
      .getOne()
    if (!freezeTx) {
      throw BusinessException.notFound('冻结流水', { freezeId, userId })
    }
    if (freezeTx.reservationId != null) {
      throw BusinessException.validationError('V2 积分预留不能通过旧版账务接口结算或释放', {
        code: 'V2_RESERVATION_LEGACY_OPERATION_FORBIDDEN',
        freezeId,
        reservationId: freezeTx.reservationId,
      })
    }

    const frozenAmount = -freezeTx.amount
    if (amount !== frozenAmount) {
      throw BusinessException.validationError('冻结预留必须按原金额全额结算或释放', {
        freezeId,
        frozenAmount,
        requestedAmount: amount,
      })
    }

    const terminal = await repo
      .createQueryBuilder('tx')
      .where('tx.freezeId = :freezeId', { freezeId })
      .andWhere('tx.type IN (:...terminalTypes)', {
        terminalTypes: [PointTransactionType.SETTLE, PointTransactionType.RELEASE],
      })
      .getOne()
    if (terminal) {
      throw BusinessException.validationError('冻结预留已经结算或释放', {
        freezeId,
        terminalTransactionId: terminal.id,
      })
    }

    return freezeTx
  }

  // -------------------- 业务操作：FREEZE --------------------

  /**
   * 冻结积分（V2 CreditOperation 架构）
   *
   * 逻辑（main 库单事务）：
   *  - 悲观锁锁定 User
   *  - 校验 currentPoints >= amount
   *  - currentPoints -= amount
   *  - 写入 CreditOperation(FREEZE) + CreditOperationOutbox(PENDING)
   *
   * @returns freezeId（= CreditOperation.id）、balance、frozen、operation
   */
  async freeze(params: {
    userId: string
    amount: number
    idempotencyKey: string
    workId?: string | null
    description?: string
    /**
     * B2.2: reservationMode=false 被禁止。
     * 新冻结必须走 CreditReservationService（reservationMode=true），
     * 直接消费使用 FREEZE + RELEASE 模式。
     */
    reservationMode?: boolean
  }): Promise<{
    freezeId: string
    balance: number
    frozen: number
    operation: CreditOperation
  }> {
    // B3: reservationMode 检查已移至 BillingService.freeze()，
    // LedgerService 本身不关心 reservationMode，由调用方负责路由。

    const { userId, amount, idempotencyKey, workId, description } = params
    const requestFingerprint = this.computeRequestFingerprint({
      userId,
      type: CreditOperationType.FREEZE,
      amount,
      workId: workId ?? '',
    })

    const { balance, operation } = await this.mainDataSource.transaction(async (manager) => {
      // 1. 幂等检查：先查是否已有操作，避免重放时重复扣减余额
      const existing = await this.findExistingOperation(
        manager,
        userId,
        CreditOperationType.FREEZE,
        idempotencyKey,
        requestFingerprint,
      )
      if (existing) {
        return {
          balance: (existing.metadata?.balanceAfter as number | undefined) ?? 0,
          operation: existing,
        }
      }

      // 2. 悲观锁读取用户
      const user = await this.lockUser(manager, userId)

      // 3. 余额校验
      if (user.currentPoints < amount) {
        throw BusinessException.insufficientCredits(
          `积分不足：当前可用 ${user.currentPoints}，需要 ${amount}`,
          { current: user.currentPoints, required: amount },
        )
      }

      // 4. 扣减可用余额
      const newBalance = user.currentPoints - amount
      user.currentPoints = newBalance
      await manager.getRepository(User).save(user)

      // 5. 写入 CreditOperation + outbox（同事务）
      const op = await this.createOperationAndOutbox(manager, {
        userId,
        type: CreditOperationType.FREEZE,
        amount: -amount,
        idempotencyKey,
        operationId: randomUUID(),
        relatedWorkId: workId ?? null,
        requestFingerprint,
        metadata: {
          balanceAfter: newBalance,
          description: description || `冻结 ${amount} 积分`,
        },
      })

      return { balance: newBalance, operation: op }
    })

    // 5. 计算冻结后余额（FREEZE 后冻结 += amount）
    const frozen = await this.getFrozenBalance(userId)

    return {
      freezeId: operation.id,
      balance,
      frozen,
      operation,
    }
  }

  // -------------------- 业务操作：SETTLE（保留旧版路径） --------------------

  /**
   * 结算冻结积分
   *
   * 保留旧版路径：仅用于历史 PointTransaction 冻结的结算。
   * V2 新冻结通过 CreditReservationService 处理（reservationMode=true）。
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

    const { balance, tx } = await this.billingDataSource.transaction(async (manager) => {
      const freezeTx = await this.lockOpenFreeze(manager, freezeId, userId, amount)
      const user = await this.mainDataSource.getRepository(User).findOne({ where: { id: userId } })
      if (!user) {
        throw BusinessException.notFound('用户', { userId })
      }

      const transaction = await this.writeTransaction(
        {
          userId,
          type: PointTransactionType.SETTLE,
          amount: -amount,
          balanceAfter: user.currentPoints,
          idempotencyKey,
          description: description || `结算 ${amount} 积分（freeze: ${freezeId}）`,
          workId: workId ?? freezeTx.workId,
          freezeId,
        },
        manager,
      )
      return { balance: user.currentPoints, tx: transaction }
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance,
      frozen,
      tx,
    }
  }

  // -------------------- 业务操作：RELEASE --------------------

  /**
   * 释放冻结积分（V2 CreditOperation 架构）
   *
   * 逻辑：
   *  - 校验 freezeId 对应的 FREEZE 流水存在且属于该用户（billing 库，历史冻结）
   *  - 悲观锁锁定 User（main 库事务）
   *  - currentPoints += amount（返还到可用余额）
   *  - 写入 CreditOperation(RELEASE) + CreditOperationOutbox(PENDING)（同事务）
   *
   * 注意：freeze 验证仍查 PointTransaction（历史冻结记录），
   * 新冻结走 CreditReservationService（reservationMode=true）。
   */
  async release(params: {
    userId: string
    amount: number
    idempotencyKey: string
    freezeId: string
    description?: string
  }): Promise<{ balance: number; frozen: number; operation: CreditOperation }> {
    const { userId, amount, idempotencyKey, freezeId, description } = params
    const requestFingerprint = this.computeRequestFingerprint({
      userId,
      type: CreditOperationType.RELEASE,
      amount,
      freezeId,
    })

    // 1. 校验历史冻结流水（billing 库）
    await this.billingDataSource.transaction(async (manager) => {
      await this.lockOpenFreeze(manager, freezeId, userId, amount)
    })

    // 2. 更新余额 + 写入 CreditOperation + outbox（main 库单事务）
    const { balance, operation } = await this.mainDataSource.transaction(async (manager) => {
      // 幂等检查：先查是否已有操作，避免重放时重复返还余额
      const existing = await this.findExistingOperation(
        manager,
        userId,
        CreditOperationType.RELEASE,
        idempotencyKey,
        requestFingerprint,
      )
      if (existing) {
        return {
          balance: (existing.metadata?.balanceAfter as number | undefined) ?? 0,
          operation: existing,
        }
      }

      const user = await this.lockUser(manager, userId)
      const newBalance = user.currentPoints + amount
      user.currentPoints = newBalance
      await manager.getRepository(User).save(user)

      const op = await this.createOperationAndOutbox(manager, {
        userId,
        type: CreditOperationType.RELEASE,
        amount: +amount,
        idempotencyKey,
        operationId: randomUUID(),
        requestFingerprint,
        metadata: {
          balanceAfter: newBalance,
          freezeId,
          description: description || `释放 ${amount} 积分（freeze: ${freezeId}）`,
        },
      })

      return { balance: newBalance, operation: op }
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance,
      frozen,
      operation,
    }
  }

  // -------------------- 业务操作：GRANT --------------------

  /**
   * 赠送积分（V2 CreditOperation 架构）
   *
   * 逻辑（main 库单事务）：
   *  - 悲观锁锁定 User
   *  - currentPoints += amount
   *  - totalPoints += amount
   *  - 写入 CreditOperation(GRANT) + CreditOperationOutbox(PENDING)
   */
  async grant(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    packageId: string
    description?: string
  }): Promise<{ balance: number; frozen: number; operation: CreditOperation }> {
    const { userId, amount, idempotencyKey, orderId, packageId, description } = params
    // B5: GRANT 指纹不包含 orderId（orderId 已在 idempotencyKey 中保证唯一），
    //     与 order-service 保持一致，避免 outbox 重放时 fingerprint 不匹配导致重复入账。
    const requestFingerprint = this.computeRequestFingerprint({
      userId,
      type: CreditOperationType.GRANT,
      amount,
      packageId,
    })

    const { balance, operation } = await this.mainDataSource.transaction(async (manager) => {
      // 幂等检查：先查是否已有操作，避免重放时重复增加余额
      const existing = await this.findExistingOperation(
        manager,
        userId,
        CreditOperationType.GRANT,
        idempotencyKey,
        requestFingerprint,
      )
      if (existing) {
        return {
          balance: (existing.metadata?.balanceAfter as number | undefined) ?? 0,
          operation: existing,
        }
      }

      const user = await this.lockUser(manager, userId)

      const newBalance = user.currentPoints + amount
      user.currentPoints = newBalance
      user.totalPoints += amount
      await manager.getRepository(User).save(user)

      const op = await this.createOperationAndOutbox(manager, {
        userId,
        type: CreditOperationType.GRANT,
        amount: +amount,
        idempotencyKey,
        operationId: randomUUID(),
        relatedOrderId: orderId,
        requestFingerprint,
        metadata: {
          balanceAfter: newBalance,
          packageId,
          description: description || `套餐赠送 ${amount} 积分（package: ${packageId}）`,
        },
      })

      return { balance: newBalance, operation: op }
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance,
      frozen,
      operation,
    }
  }

  // -------------------- 业务操作：REWARD --------------------

  /**
   * 奖励积分（V2 CreditOperation 架构）
   *
   * 逻辑（main 库单事务 + billing 库即时投影）：
   *  - 悲观锁锁定 User
   *  - currentPoints += amount
   *  - totalPoints += amount
   *  - 写入 CreditOperation(REWARD) + CreditOperationOutbox(PENDING)
   *  - B6: 同时投影 PointTransaction(REWARD) 到 billing 库
   *    （CreditOperationOutbox 尚无消费者投影，对账 countRewardsByTemplateId 依赖 PointTransaction）
   */
  async reward(params: {
    userId: string
    amount: number
    idempotencyKey: string
    templateId: string
    description?: string
  }): Promise<{ balance: number; frozen: number; operation: CreditOperation }> {
    const { userId, amount, idempotencyKey, templateId, description } = params
    const requestFingerprint = this.computeRequestFingerprint({
      userId,
      type: CreditOperationType.REWARD,
      amount,
      templateId,
    })

    const { balance, operation } = await this.mainDataSource.transaction(async (manager) => {
      // 幂等检查：先查是否已有操作，避免重放时重复增加余额
      const existing = await this.findExistingOperation(
        manager,
        userId,
        CreditOperationType.REWARD,
        idempotencyKey,
        requestFingerprint,
      )
      if (existing) {
        return {
          balance: (existing.metadata?.balanceAfter as number | undefined) ?? 0,
          operation: existing,
        }
      }

      const user = await this.lockUser(manager, userId)

      const newBalance = user.currentPoints + amount
      user.currentPoints = newBalance
      user.totalPoints += amount
      await manager.getRepository(User).save(user)

      const op = await this.createOperationAndOutbox(manager, {
        userId,
        type: CreditOperationType.REWARD,
        amount: +amount,
        idempotencyKey,
        operationId: randomUUID(),
        relatedTemplateId: templateId,
        requestFingerprint,
        metadata: {
          balanceAfter: newBalance,
          description: description || `模板奖励 ${amount} 积分（template: ${templateId}）`,
        },
      })

      // B6: 即时投影到 billing 库 PointTransaction
      //     对账服务 countRewardsByTemplateId 查询 PointTransaction(REWARD)，
      //     CreditOperationOutbox 尚无消费者，需在此处即时投影。
      //     注意：writeTransaction 未传 manager（跨库不能共享事务），
      //     若 billing 库写入失败不应阻塞 main 库事务，由对账服务兜底。
      try {
        await this.writeTransaction({
          userId,
          type: PointTransactionType.REWARD,
          amount: +amount,
          balanceAfter: newBalance,
          templateId,
          idempotencyKey,
          description: description || `模板奖励 ${amount} 积分（template: ${templateId}）`,
        })
      } catch (err) {
        // billing 库投影失败：main 库 CreditOperation + outbox 已写入，
        // 对账服务会在下次运行时补齐 PointTransaction。
        // 不抛出异常，避免回滚 main 库事务导致用户积分丢失。
        this.logger.warn(
          `REWARD billing 库投影失败（对账服务兜底）userId=${userId} templateId=${templateId}: ${(err as Error).message}`,
        )
      }

      return { balance: newBalance, operation: op }
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance,
      frozen,
      operation,
    }
  }

  // -------------------- 业务操作：CONSUME --------------------

  /**
   * 直接消费积分（V2 CreditOperation 架构）
   *
   * 逻辑（main 库单事务）：
   *  - 悲观锁锁定 User
   *  - 校验 currentPoints >= amount
   *  - currentPoints -= amount
   *  - 写入 CreditOperation(CONSUME) + CreditOperationOutbox(PENDING)
   */
  async consume(params: {
    userId: string
    amount: number
    idempotencyKey: string
    workId?: string | null
    description?: string
  }): Promise<{ balance: number; frozen: number; operation: CreditOperation }> {
    const { userId, amount, idempotencyKey, workId, description } = params
    const requestFingerprint = this.computeRequestFingerprint({
      userId,
      type: CreditOperationType.CONSUME,
      amount,
      workId: workId ?? '',
    })

    const { balance, operation } = await this.mainDataSource.transaction(async (manager) => {
      // 幂等检查：先查是否已有操作，避免重放时重复扣减余额
      const existing = await this.findExistingOperation(
        manager,
        userId,
        CreditOperationType.CONSUME,
        idempotencyKey,
        requestFingerprint,
      )
      if (existing) {
        return {
          balance: (existing.metadata?.balanceAfter as number | undefined) ?? 0,
          operation: existing,
        }
      }

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

      const op = await this.createOperationAndOutbox(manager, {
        userId,
        type: CreditOperationType.CONSUME,
        amount: -amount,
        idempotencyKey,
        operationId: randomUUID(),
        relatedWorkId: workId ?? null,
        requestFingerprint,
        metadata: {
          balanceAfter: newBalance,
          description: description || `消费 ${amount} 积分`,
        },
      })

      return { balance: newBalance, operation: op }
    })

    const frozen = await this.getFrozenBalance(userId)

    return {
      balance,
      frozen,
      operation,
    }
  }
}
