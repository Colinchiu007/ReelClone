/**
 * BillingService — 积分业务编排
 *
 * 职责：
 *  1. 缓存：余额 / 冻结余额，TTL 60s
 *  2. 幂等：基于 Redis 锁 + DB 唯一约束 + 结果缓存，保证重复请求返回首次结果
 *  3. 编排：调用 LedgerService 执行事务化记账
 *  4. 查询：余额、流水列表、流水详情
 *
 * 缓存键：
 *  - points:balance:{userId}     余额缓存（TTL 60s）
 *  - points:frozen:{userId}      冻结余额缓存（TTL 60s）
 *  - points:idempotency:{key}    幂等结果缓存（TTL 24h）
 *  - points:idem-lock:{key}      幂等锁（TTL 30s，防止并发重复执行）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { randomUUID } from 'crypto'
import Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { BusinessException, ErrorCode } from '@reelclone/common'
import {
  CreditOperation,
  CreditOperationType,
  DATABASE_CONNECTIONS,
  PointTransaction,
  PointTransactionType,
  REDIS_CLIENT,
  User,
} from '@reelclone/database'
import { LedgerService } from './ledger.service'
import { CreditReservationService } from './credit-reservation.service'
import { ListTransactionsDto, TransactionDirection } from './dto/list-transactions.dto'
import { RewardPointsDto } from './dto/reward-points.dto'

/** 余额响应 */
export interface BalanceResponse {
  balance: number
  frozen: number
  total: number
}

/** 内部操作响应 */
export interface OperationResponse {
  success: boolean
  frozenAmount?: number
  balance: number
  transactionId: string
}

/** 分页响应数据 */
export interface PaginatedTransactions {
  list: PointTransaction[]
  page: number
  pageSize: number
  total: number
}

/** 默认缓存 TTL（秒） */
const BALANCE_TTL = 60
const FROZEN_TTL = 60
const IDEMPOTENCY_RESULT_TTL = 86400 // 24h

/**
 * 按操作类型设置 Redis 幂等锁 TTL（秒）
 *
 * B2.3: 分级 TTL — freeze 操作 30s（由 CreditReservationService DB 级锁处理，
 * 不经 runIdempotent），短操作（settle/release/grant/reward/consume）5s。
 */
const LOCK_TTL_SETTLE = 5
const LOCK_TTL_RELEASE = 5
const LOCK_TTL_DEFAULT = 5

/**
 * Lua 脚本：仅当锁的值等于 owner token 时才删除（compare-delete）。
 * 防止释放了其他实例持有的锁。
 */
const RELEASE_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

/** 缓存键生成器 */
const balanceKey = (userId: string) => `points:balance:${userId}`
const frozenKey = (userId: string) => `points:frozen:${userId}`
const idemResultKey = (key: string) => `points:idempotency:${key}`
const idemLockKey = (key: string) => `points:idem-lock:${key}`

/** 序列化后的幂等结果 */
interface IdempotencyRecord {
  ok: boolean
  data: unknown
  error?: { code: number; message: string; details?: unknown }
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @InjectDataSource(DATABASE_CONNECTIONS.BILLING)
    private readonly billingDataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly creditReservations: CreditReservationService,
  ) {}

  // -------------------- 查询：余额 --------------------

  /**
   * 获取用户余额（缓存优先）
   *
   * 优先读 Redis 缓存，未命中则查 main 库 User 表 + billing 库冻结聚合，
   * 写入缓存后返回。
   */
  async getBalance(userId: string): Promise<BalanceResponse> {
    // 1. 尝试缓存
    const [cachedBalance, cachedFrozen] = await Promise.all([
      this.redis.get(balanceKey(userId)),
      this.redis.get(frozenKey(userId)),
    ])

    if (cachedBalance !== null && cachedFrozen !== null) {
      const userRepo = this.mainDataSource.getRepository(User)
      const total = await userRepo
        .createQueryBuilder('u')
        .select('u.totalPoints', 'total')
        .where('u.id = :userId', { userId })
        .getRawOne<{ total: number }>()
      return {
        balance: parseInt(cachedBalance, 10),
        frozen: parseInt(cachedFrozen, 10),
        total: Number(total?.total ?? 0),
      }
    }

    // 2. 缓存未命中：查 DB
    const userRepo = this.mainDataSource.getRepository(User)
    const user = await userRepo.findOne({ where: { id: userId } })
    if (!user) {
      throw BusinessException.notFound('用户', { userId })
    }

    const frozen = await this.ledger.getFrozenBalance(userId)

    // 3. 回填缓存（不阻塞返回）
    await Promise.all([
      this.redis.set(balanceKey(userId), String(user.currentPoints), 'EX', BALANCE_TTL),
      this.redis.set(frozenKey(userId), String(frozen), 'EX', FROZEN_TTL),
    ])

    return {
      balance: user.currentPoints,
      frozen,
      total: user.totalPoints,
    }
  }

  /**
   * 失效用户余额缓存
   * 在所有写操作成功后调用
   */
  private async invalidateBalanceCache(userId: string): Promise<void> {
    try {
      await Promise.all([this.redis.del(balanceKey(userId)), this.redis.del(frozenKey(userId))])
    } catch (err) {
      // 余额变更已经在数据库提交；缓存失效失败只能触发短暂旧读，不能把成功操作报成失败。
      this.logger.warn(`积分缓存失效失败 userId=${userId}: ${(err as Error).message}`)
    }
  }

  // -------------------- 查询：流水列表 --------------------

  /**
   * 分页查询用户流水
   */
  async listTransactions(userId: string, dto: ListTransactionsDto): Promise<PaginatedTransactions> {
    const repo: Repository<PointTransaction> =
      this.billingDataSource.getRepository(PointTransaction)

    const qb = repo.createQueryBuilder('tx').where('tx.userId = :userId', { userId })

    if (dto.type) {
      qb.andWhere('tx.type = :type', { type: dto.type })
    }

    if (dto.direction) {
      if (dto.direction === TransactionDirection.DEBIT) {
        qb.andWhere('tx.amount < 0')
      } else {
        qb.andWhere('tx.amount > 0')
      }
    }

    if (dto.startTime) {
      qb.andWhere('tx.createdAt >= :startTime', { startTime: dto.startTime })
    }
    if (dto.endTime) {
      qb.andWhere('tx.createdAt <= :endTime', { endTime: dto.endTime })
    }

    qb.orderBy('tx.createdAt', 'DESC')

    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  /**
   * 查询单笔流水详情
   */
  async getTransaction(userId: string, id: string): Promise<PointTransaction> {
    const tx = await this.ledger.findById(id, userId)
    if (!tx) {
      throw BusinessException.notFound('流水', { id, userId })
    }
    return tx
  }

  // -------------------- 内部操作：FREEZE --------------------

  async freeze(params: {
    userId: string
    amount: number
    idempotencyKey: string
    workId?: string | null
    description?: string
    /**
     * V2 路由：
     *  - reservationMode=true: CreditReservationService（生成链路，需 workId）
     *  - reservationMode=false/undefined: LedgerService（benchmark 等非生成链路）
     *
     * B3: 恢复 reservationMode=false 路径以支持 benchmark 等非生成场景，
     * 仍禁止隐式双写——benchmark 走 LedgerService V2 CreditOperation 路径。
     */
    reservationMode?: boolean
  }): Promise<OperationResponse> {
    if (params.reservationMode === true) {
      if (!params.workId) {
        throw BusinessException.validationError('V2 积分预留必须关联作品', {
          code: 'RESERVATION_WORK_REQUIRED',
        })
      }
      const result = await this.creditReservations.freeze({
        userId: params.userId,
        workId: params.workId,
        amount: params.amount,
        idempotencyKey: params.idempotencyKey,
        description: params.description,
      })
      await this.invalidateBalanceCache(params.userId)
      return {
        success: true,
        frozenAmount: params.amount,
        balance: result.balance,
        transactionId: result.transactionId,
      }
    }

    // reservationMode=false/undefined: LedgerService V2 CreditOperation 路径
    return this.runIdempotent(
      params.idempotencyKey,
      async () => {
        const result = await this.ledger.freeze({
          userId: params.userId,
          amount: params.amount,
          idempotencyKey: params.idempotencyKey,
          workId: params.workId,
          description: params.description,
        })
        await this.invalidateBalanceCache(params.userId)
        return {
          success: true,
          frozenAmount: params.amount,
          balance: result.balance,
          transactionId: result.freezeId,
        }
      },
      LOCK_TTL_DEFAULT,
    )
  }

  // -------------------- 内部操作：SETTLE --------------------

  async settle(params: {
    userId: string
    amount: number
    idempotencyKey: string
    freezeId: string
    workId?: string | null
    description?: string
    reservationMode?: boolean
  }): Promise<OperationResponse> {
    if (params.reservationMode) {
      const result = await this.creditReservations.settle(params)
      await this.invalidateBalanceCache(params.userId)
      return {
        success: true,
        frozenAmount: params.amount,
        balance: result.balance,
        transactionId: result.transactionId,
      }
    }
    return this.runIdempotent(
      params.idempotencyKey,
      async () => {
        const result = await this.ledger.settle(params)
        await this.invalidateBalanceCache(params.userId)
        return {
          success: true,
          frozenAmount: params.amount,
          balance: result.balance,
          transactionId: result.tx.id,
        }
      },
      LOCK_TTL_SETTLE,
    )
  }

  // -------------------- 内部操作：RELEASE --------------------

  async release(params: {
    userId: string
    amount: number
    idempotencyKey: string
    freezeId: string
    description?: string
    reservationMode?: boolean
  }): Promise<OperationResponse> {
    if (params.reservationMode) {
      const result = await this.creditReservations.release(params)
      await this.invalidateBalanceCache(params.userId)
      return {
        success: true,
        frozenAmount: params.amount,
        balance: result.balance,
        transactionId: result.transactionId,
      }
    }
    return this.runIdempotent(
      params.idempotencyKey,
      async () => {
        const result = await this.ledger.release(params)
        await this.invalidateBalanceCache(params.userId)
        return {
          success: true,
          frozenAmount: params.amount,
          balance: result.balance,
          transactionId: result.operation.id,
        }
      },
      LOCK_TTL_RELEASE,
    )
  }

  // -------------------- 内部操作：GRANT --------------------

  async grant(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    packageId: string
    description?: string
  }): Promise<OperationResponse> {
    return this.runIdempotent(params.idempotencyKey, async () => {
      const result = await this.ledger.grant(params)
      await this.invalidateBalanceCache(params.userId)
      return {
        success: true,
        frozenAmount: params.amount,
        balance: result.balance,
        transactionId: result.operation.id,
      }
    })
  }

  // -------------------- 内部操作：REWARD --------------------

  /**
   * 模板被使用奖励上传者
   *
   * 通过 runIdempotent 包装 LedgerService.reward，
   * 复用三层幂等机制（Redis 缓存 + Redis 锁 + DB 唯一约束）。
   */
  async reward(dto: RewardPointsDto): Promise<OperationResponse> {
    return this.runIdempotent(dto.idempotencyKey, async () => {
      const result = await this.ledger.reward({
        userId: dto.userId,
        amount: dto.amount,
        idempotencyKey: dto.idempotencyKey,
        templateId: dto.templateId,
        description: dto.description,
      })
      await this.invalidateBalanceCache(dto.userId)
      return {
        success: true,
        frozenAmount: dto.amount,
        balance: result.balance,
        transactionId: result.operation.id,
      }
    })
  }

  /**
   * 统计某模板已发放的 REWARD 流水数（内部接口，供对账任务使用）
   *
   * @param templateId 模板 ID
   * @returns 已成功发放的奖励次数
   */
  async countRewardsByTemplateId(templateId: string): Promise<number> {
    const repo: Repository<PointTransaction> =
      this.billingDataSource.getRepository(PointTransaction)
    const count = await repo.count({
      where: { templateId, type: PointTransactionType.REWARD },
    })
    return count
  }

  /**
   * 查询某模板已实际发放的奖励序号列表（P1-10 间隙补偿）
   *
   * 从 main 库 CreditOperation 权威记录提取序号，而非 billing 库 PointTransaction 投影。
   * billing 库投影可能失败（ledger.service.ts 第 769-786 行 try/catch），
   * 导致序号间隙，用 COUNT(*) 推导的序号起始点会跳过间隙中的漏发。
   *
   * 幂等键格式：`reward:template:{templateId}:use:{n}`
   * 通过正则提取 n，返回已存在的序号集合（升序排列）。
   *
   * @param templateId 模板 ID
   * @returns 已发放的奖励序号列表（如 [1, 2, 4, 5] 表示 3 号漏发）
   */
  async getRewardOrdinalsByTemplateId(templateId: string): Promise<number[]> {
    const repo = this.mainDataSource.getRepository(CreditOperation)
    const operations = await repo.find({
      select: ['idempotencyKey'],
      where: {
        type: CreditOperationType.REWARD,
        relatedTemplateId: templateId,
      },
    })

    const prefix = `reward:template:${templateId}:use:`
    const ordinals: number[] = []
    for (const op of operations) {
      const key = op.idempotencyKey
      if (key.startsWith(prefix)) {
        const n = Number(key.slice(prefix.length))
        if (Number.isFinite(n) && n > 0) {
          ordinals.push(n)
        }
      }
    }

    return ordinals.sort((a, b) => a - b)
  }

  // -------------------- 幂等编排 --------------------

  /**
   * 幂等执行包装器
   *
   * 流程：
   *  1. 查幂等结果缓存，命中则直接返回
   *  2. 抢占 Redis 锁（SET NX EX，value=owner token）
   *  3. 双重检查：DB 中是否已有该 idempotencyKey 的流水或 CreditOperation，有则返回
   *  4. 执行业务函数
   *  5. 写入幂等结果缓存（TTL 24h）
   *  6. 释放锁（Lua compare-delete，仅 owner 可释放）
   *
   * B2.3 修复：
   *  - 每次锁申请生成 owner token（UUID），不再用固定值 '1'
   *  - 释放锁使用 Lua compare-delete 脚本，防止误删其他实例的锁
   *  - TTL 按操作类型传入（freeze: 30s, 短操作: 5s）
   *
   * 说明：
   *  - 业务函数抛 BusinessException 时，错误信息也会被缓存（避免重复打错误响应）
   *  - 非 BusinessException 不缓存（可能是临时故障，允许重试）
   */
  private async runIdempotent<T>(
    idempotencyKey: string,
    fn: () => Promise<T>,
    lockTtlSec: number = LOCK_TTL_DEFAULT,
  ): Promise<T> {
    // 1. 查缓存
    const cached = await this.redis.get(idemResultKey(idempotencyKey))
    if (cached !== null) {
      const record: IdempotencyRecord = JSON.parse(cached)
      if (record.ok) {
        return record.data as T
      }
      // 还原业务异常
      throw new BusinessException(
        record.error?.code ?? ErrorCode.INTERNAL_ERROR,
        record.error?.message ?? '重复请求失败',
        record.error?.details as never,
      )
    }

    // 2. 抢占锁（owner token = UUID，TTL 按操作类型）
    const owner = randomUUID()
    const lockAcquired = await this.redis.set(
      idemLockKey(idempotencyKey),
      owner,
      'EX',
      lockTtlSec,
      'NX',
    )
    if (!lockAcquired) {
      // 锁被占用：可能是并发请求，等待短暂时间后读缓存
      await new Promise((resolve) => setTimeout(resolve, 200))
      const retryCached = await this.redis.get(idemResultKey(idempotencyKey))
      if (retryCached !== null) {
        const record: IdempotencyRecord = JSON.parse(retryCached)
        if (record.ok) {
          return record.data as T
        }
        throw new BusinessException(
          record.error?.code ?? ErrorCode.INTERNAL_ERROR,
          record.error?.message ?? '重复请求失败',
          record.error?.details as never,
        )
      }
      // 仍然没结果：锁未释放，可能是上次执行慢
      throw new BusinessException(ErrorCode.RATE_LIMITED, '请求正在处理中，请稍后重试', {
        idempotencyKey,
      })
    }

    try {
      // 3. 双重检查：DB 中是否已有（先查 billing PointTransaction 旧版，再查 main CreditOperation V2）
      const existingTx = await this.ledger.findByIdempotencyKey(idempotencyKey)
      if (existingTx) {
        // 已有旧版流水：构造幂等返回
        const result = {
          success: true,
          frozenAmount: Math.abs(existingTx.amount),
          balance: existingTx.balance,
          transactionId: existingTx.id,
        } as unknown as T
        await this.cacheIdempotencyResult(idempotencyKey, result)
        return result
      }
      const existingOp = await this.ledger.findOperationByIdempotencyKey(idempotencyKey)
      if (existingOp) {
        // 已有 V2 CreditOperation：构造幂等返回（balance 从 metadata 读取）
        const result = {
          success: true,
          frozenAmount: Math.abs(existingOp.amount),
          balance: (existingOp.metadata?.balanceAfter as number | undefined) ?? 0,
          transactionId: existingOp.id,
        } as unknown as T
        await this.cacheIdempotencyResult(idempotencyKey, result)
        return result
      }

      // 4. 执行业务
      const result = await fn()

      // 5. 缓存成功结果
      await this.cacheIdempotencyResult(idempotencyKey, result)

      return result
    } catch (err) {
      // BusinessException：缓存错误响应
      if (err instanceof BusinessException) {
        await this.cacheIdempotencyError(idempotencyKey, err)
      }
      throw err
    } finally {
      // 6. 释放锁（Lua compare-delete：仅当锁值 == owner 时才删除）
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, idemLockKey(idempotencyKey), owner)
    }
  }

  /** 缓存幂等成功结果 */
  private async cacheIdempotencyResult<T>(idempotencyKey: string, data: T): Promise<void> {
    const record: IdempotencyRecord = { ok: true, data }
    await this.redis.set(
      idemResultKey(idempotencyKey),
      JSON.stringify(record),
      'EX',
      IDEMPOTENCY_RESULT_TTL,
    )
  }

  /** 缓存幂等错误结果 */
  private async cacheIdempotencyError(
    idempotencyKey: string,
    err: BusinessException,
  ): Promise<void> {
    const record: IdempotencyRecord = {
      ok: false,
      data: null,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    }
    // 错误结果缓存较短时间（5 分钟），允许后续重试
    await this.redis.set(idemResultKey(idempotencyKey), JSON.stringify(record), 'EX', 300)
  }
}
