/**
 * ReconciliationService — 跨库事务对账
 *
 * 职责：
 *  1. 对比 main 库 User 余额与 billing 库流水聚合，检测跨库操作（FREEZE/SETTLE/RELEASE/GRANT/CONSUME）
 *     在 main 库事务提交但 billing 库插入失败时产生的不一致
 *  2. 支持单用户 / 全量 / 按日期 / 按时间窗口对账
 *  3. 不一致时记录 WARN 日志（MVP 阶段不做外部告警，后续可接飞书/钉钉 webhook）
 *
 * 对账公式（P0-3 修正版）：
 *  - userBalance     = User.currentPoints（main 库可用余额）
 *  - txBalance       = SUM(PointTransaction.amount)（billing 库流水合计，含正负号）
 *  - frozen          = FREEZE/SETTLE/RELEASE 聚合 + V2 OPEN reservation（复用 LedgerService.getFrozenBalance）
 *  - totalSettled    = -SUM(PointTransaction.amount WHERE type=SETTLE)（已结算冻结量）
 *  - totalConsumed   = -SUM(PointTransaction.amount WHERE type=CONSUME)（直接消费量）
 *  - expectedBalance = User.totalPoints - frozen - totalSettled - totalConsumed
 *  - difference      = userBalance - expectedBalance
 *  - isConsistent    = difference === 0
 *
 * 推导（P0-3 修正）：
 *  - currentPoints = initial + GRANT + REWARD - FREEZE + RELEASE - CONSUME
 *  -              = totalPoints - FREEZE + RELEASE - CONSUME
 *  -              = totalPoints - (frozen + SETTLE + RELEASE) + RELEASE - CONSUME
 *  -              = totalPoints - frozen - SETTLE - CONSUME
 *
 *  - totalPoints 仅在 GRANT/REWARD 时累加，代表"历史累计获得"
 *  - frozen 代表"当前被冻结的总量"，FREEZE 增、SETTLE/RELEASE 减
 *  - SETTLE 表示冻结积分被成功消费（不再可用但 currentPoints 已在 FREEZE 时扣减）
 *  - CONSUME 表示直接消费积分（currentPoints 在 CONSUME 时扣减，不影响 frozen）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  DATABASE_CONNECTIONS,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'
import { LedgerService } from './ledger.service'

/** 单用户对账结果 */
export interface ReconciliationResult {
  userId: string
  userBalance: number // main 库 User.currentPoints
  txBalance: number // billing 库 SUM(amount)
  frozen: number // 冻结余额
  totalSettled: number // 已结算冻结量（-SUM(SETTLE.amount)）
  totalConsumed: number // 直接消费量（-SUM(CONSUME.amount)）
  expectedBalance: number // totalPoints - frozen - totalSettled - totalConsumed
  difference: number // userBalance - expectedBalance
  isConsistent: boolean // difference === 0
}

/** 对账汇总 */
export interface ReconciliationSummary {
  /** 检查的用户数 */
  totalUsers: number
  /** 不一致用户数 */
  inconsistentCount: number
  /** 不一致用户的明细（一致的不列入，避免日志膨胀） */
  results: ReconciliationResult[]
  /** 按日期对账时的日期（YYYY-MM-DD），可选 */
  date?: string
  startedAt: Date
  finishedAt: Date
}

/** 分页大小 */
const PAGE_SIZE = 500

/** SUM 聚合结果 */
interface SumAggregate {
  total: string | number | null
}

/** 用户余额投影（仅取对账所需字段） */
interface UserBalanceRow {
  id: string
  currentPoints: number
  totalPoints: number
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @InjectDataSource(DATABASE_CONNECTIONS.BILLING)
    private readonly billingDataSource: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  // -------------------- 单用户对账 --------------------

  /**
   * 对单个用户对账
   *
   * 流程：
   *  1. main 库读取 User.currentPoints / totalPoints
   *  2. billing 库计算 SUM(PointTransaction.amount) 得到流水余额
   *  3. 计算冻结余额（复用 LedgerService.getFrozenBalance）
   *  4. expectedBalance = totalPoints - frozen，与 currentPoints 比较
   *  5. 不一致时记录 WARN 日志
   */
  async reconcileUser(userId: string): Promise<ReconciliationResult> {
    const user = await this.fetchUserBalance(userId)
    if (!user) {
      throw new Error(`对账失败：用户不存在 ${userId}`)
    }
    return this.reconcileUserRow(user)
  }

  // -------------------- 全量对账 --------------------

  /**
   * 全量对账（定时任务调用）
   *
   * 分页遍历所有用户，对每个用户调用 reconcileUser，汇总不一致的用户数。
   */
  async reconcileAll(): Promise<ReconciliationSummary> {
    const startedAt = new Date()
    this.logger.log('全量对账开始')

    const userRepo = this.mainDataSource.getRepository(User)
    const inconsistent: ReconciliationResult[] = []
    let totalUsers = 0
    let page = 0

    // 按 id 升序分页遍历所有用户
    let hasMore = true
    while (hasMore) {
      const users: UserBalanceRow[] = await userRepo
        .createQueryBuilder('u')
        .select(['u.id AS id', 'u.currentPoints AS currentPoints', 'u.totalPoints AS totalPoints'])
        .orderBy('u.id', 'ASC')
        .skip(page * PAGE_SIZE)
        .take(PAGE_SIZE)
        .getRawMany<UserBalanceRow>()

      if (users.length === 0) {
        hasMore = false
        break
      }

      for (const u of users) {
        totalUsers++
        const result = await this.reconcileUserRow(u)
        if (!result.isConsistent) {
          inconsistent.push(result)
        }
      }

      page++
    }

    const finishedAt = new Date()
    this.logger.log(
      `全量对账完成 totalUsers=${totalUsers} inconsistent=${inconsistent.length} 耗时=${finishedAt.getTime() - startedAt.getTime()}ms`,
    )

    return {
      totalUsers,
      inconsistentCount: inconsistent.length,
      results: inconsistent,
      startedAt,
      finishedAt,
    }
  }

  // -------------------- 按日期对账 --------------------

  /**
   * 按日期对账：仅检查当天有流水的用户（只检查当天的流水）
   *
   * @param date YYYY-MM-DD 格式（本地时区）
   */
  async reconcileByDate(date: string): Promise<ReconciliationSummary> {
    const startedAt = new Date()
    this.logger.log(`按日期对账开始 date=${date}`)

    const { start, end } = this.parseDateRange(date)
    const userIds = await this.findUserIdsBetween(start, end)

    this.logger.log(`按日期对账 date=${date} 命中用户数=${userIds.length}`)

    const inconsistent: ReconciliationResult[] = []
    for (const userId of userIds) {
      const result = await this.reconcileUser(userId)
      if (!result.isConsistent) {
        inconsistent.push(result)
      }
    }

    const finishedAt = new Date()
    this.logger.log(
      `按日期对账完成 date=${date} checked=${userIds.length} inconsistent=${inconsistent.length}`,
    )

    return {
      totalUsers: userIds.length,
      inconsistentCount: inconsistent.length,
      results: inconsistent,
      date,
      startedAt,
      finishedAt,
    }
  }

  // -------------------- 按时间窗口对账（小时级增量）--------------------

  /**
   * 按时间窗口对账：检查自 since 以来有流水的用户
   *
   * 定时任务每小时调用，传入 1 小时前的时间戳，仅对账该窗口内有活动的用户。
   */
  async reconcileSince(since: Date): Promise<ReconciliationSummary> {
    const startedAt = new Date()
    this.logger.log(`增量对账开始 since=${since.toISOString()}`)

    const userIds = await this.findUserIdsBetween(since, startedAt)

    this.logger.log(`增量对账 since=${since.toISOString()} 命中用户数=${userIds.length}`)

    const inconsistent: ReconciliationResult[] = []
    for (const userId of userIds) {
      const result = await this.reconcileUser(userId)
      if (!result.isConsistent) {
        inconsistent.push(result)
      }
    }

    const finishedAt = new Date()
    this.logger.log(
      `增量对账完成 since=${since.toISOString()} checked=${userIds.length} inconsistent=${inconsistent.length}`,
    )

    return {
      totalUsers: userIds.length,
      inconsistentCount: inconsistent.length,
      results: inconsistent,
      startedAt,
      finishedAt,
    }
  }

  // -------------------- 内部工具 --------------------

  /**
   * 对账核心逻辑（基于已查询的用户余额行）
   *
   * 抽取为私有方法，避免全量对账时对每个用户重复查询 main 库。
   */
  private async reconcileUserRow(user: UserBalanceRow): Promise<ReconciliationResult> {
    const userId = user.id

    // 1. billing 库 SUM(amount)
    const txBalance = await this.sumTransactions(userId)

    // 2. 冻结余额（复用 LedgerService 聚合逻辑，保证与业务侧口径一致）
    const frozen = await this.ledger.getFrozenBalance(userId)

    // 3. P0-3: 查询 SETTLE 和 CONSUME 聚合
    const totalSettled = await this.sumByType(userId, PointTransactionType.SETTLE)
    const totalConsumed = await this.sumByType(userId, PointTransactionType.CONSUME)

    // 4. 计算期望余额与差异
    //    expectedBalance = totalPoints - frozen - totalSettled - totalConsumed
    const expectedBalance = user.totalPoints - frozen - totalSettled - totalConsumed
    const difference = user.currentPoints - expectedBalance
    const isConsistent = difference === 0

    const result: ReconciliationResult = {
      userId,
      userBalance: user.currentPoints,
      txBalance,
      frozen,
      totalSettled,
      totalConsumed,
      expectedBalance,
      difference,
      isConsistent,
    }

    if (!isConsistent) {
      this.logger.warn(
        `对账不一致 userId=${userId} userBalance=${user.currentPoints} txBalance=${txBalance} frozen=${frozen} totalSettled=${totalSettled} totalConsumed=${totalConsumed} expectedBalance=${expectedBalance} difference=${difference}`,
      )
    }

    return result
  }

  /** 从 main 库查询单个用户的余额字段 */
  private async fetchUserBalance(userId: string): Promise<UserBalanceRow | null> {
    const userRepo = this.mainDataSource.getRepository(User)
    const row = await userRepo
      .createQueryBuilder('u')
      .select(['u.id AS id', 'u.currentPoints AS currentPoints', 'u.totalPoints AS totalPoints'])
      .where('u.id = :userId', { userId })
      .getRawOne<UserBalanceRow>()
    return row ?? null
  }

  /** 计算 billing 库 SUM(amount) */
  private async sumTransactions(userId: string): Promise<number> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const result = await repo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'total')
      .where('tx.userId = :userId', { userId })
      .getRawOne<SumAggregate>()
    return Number(result?.total ?? 0)
  }

  /**
   * P0-3: 按类型聚合用户流水金额（SETTLE/CONSUME）
   *
   * amount 在实体中带符号（SETTLE/CONSUME 为负），返回 -SUM 即为正的已消费量。
   */
  private async sumByType(userId: string, type: PointTransactionType): Promise<number> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const result = await repo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(-tx.amount), 0)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.type = :type', { type })
      .getRawOne<SumAggregate>()
    return Number(result?.total ?? 0)
  }

  /** 查询指定时间窗口内有流水的去重用户 ID 列表 */
  private async findUserIdsBetween(start: Date, end: Date): Promise<string[]> {
    const repo = this.billingDataSource.getRepository(PointTransaction)
    const rows = await repo
      .createQueryBuilder('tx')
      .select('DISTINCT tx.userId', 'userId')
      .where('tx.createdAt >= :start', { start })
      .andWhere('tx.createdAt < :end', { end })
      .getRawMany<{ userId: string }>()
    return rows.map((r) => r.userId)
  }

  /** 将 YYYY-MM-DD 解析为本地时区当天的 [start, end) 时间区间 */
  private parseDateRange(date: string): { start: Date; end: Date } {
    const parts = date.split('-').map((s) => parseInt(s, 10))
    const [y, m, d] = parts
    if (parts.length !== 3 || !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      throw new Error(`无效的日期格式，期望 YYYY-MM-DD，收到 ${date}`)
    }
    const start = new Date(y, m - 1, d, 0, 0, 0, 0)
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
    return { start, end }
  }
}
