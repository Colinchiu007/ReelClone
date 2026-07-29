/**
 * AdminStatsService — 数据统计服务
 *
 * 职责：
 * - getOverview：概览指标（DAU / 新增用户 / GMV / 生成量 / 积分消耗 + 按天趋势）
 * - getPointsFlow：积分流水分页查询（从 billing 库）
 *
 * 数据源：
 * - main 库：users（DAU/新增）、orders（GMV）、works（生成量）
 * - billing 库：point_transactions（积分消耗/流水）
 *
 * 趋势聚合使用 TypeORM queryBuilder 按天 GROUP BY（PostgreSQL DATE() 函数）。
 */
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DATABASE_CONNECTIONS,
  Order,
  OrderStatus,
  PointTransaction,
  PointTransactionType,
  User,
  Work,
} from '@reelclone/database'
import { OverviewQueryDto, OverviewRange } from './dto/overview-query.dto'
import { PointsFlowQueryDto } from './dto/points-flow-query.dto'

/** 趋势数据 */
interface Trends {
  /** 日期数组（YYYY-MM-DD） */
  dates: string[]
  /** DAU 趋势 */
  dau: number[]
  /** 新增用户趋势 */
  newUsers: number[]
  /** GMV 趋势 */
  gmv: number[]
}

/** 概览指标结果 */
export interface OverviewResult {
  /** 日活（当天 lastLoginAt 命中用户数） */
  dau: number
  /** 时间范围内新增用户数 */
  newUsers: number
  /** 时间范围内 GMV（PAID 订单金额合计，元） */
  gmv: number
  /** 时间范围内作品生成量 */
  generationCount: number
  /** 时间范围内积分消耗量（CONSUME 绝对值合计） */
  pointsConsumed: number
  /** 按天趋势 */
  trends: Trends
}

/** 积分流水列表项 */
export interface PointsFlowItem {
  id: string
  userId: string
  type: PointTransactionType
  amount: number
  balance: number
  source: string | null
  createdAt: Date
}

/** 分页积分流水结果 */
export interface PaginatedPointsFlow {
  list: PointsFlowItem[]
  page: number
  pageSize: number
  total: number
}

/** SUM 聚合结果（PostgreSQL 返回 string 或 number） */
interface SumAggregate {
  total: string | number | null
}

/** 按天聚合结果行 */
interface DailyAggregateRow {
  day: Date | string
  count: string | number | null
}

/** GMV 按天聚合结果行 */
interface DailyGmvRow {
  day: Date | string
  total: string | number | null
}

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Work, DATABASE_CONNECTIONS.MAIN)
    private readonly workRepo: Repository<Work>,
    @InjectRepository(Order, DATABASE_CONNECTIONS.MAIN)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(PointTransaction, DATABASE_CONNECTIONS.BILLING)
    private readonly pointTxRepo: Repository<PointTransaction>,
  ) {}

  // -------------------- 概览指标 --------------------

  /**
   * 概览指标
   *
   * 时间范围：
   *  - '7d'  最近 7 天（含今天）
   *  - '30d' 最近 30 天（含今天）
   *
   * 各指标口径：
   *  - dau: 当天 lastLoginAt 命中的用户数（基于今天 00:00 ~ 明天 00:00）
   *  - newUsers: 时间范围内 createdAt 命中的用户数
   *  - gmv: 时间范围内 PAID 订单的 amount 合计（元）
   *  - generationCount: 时间范围内 works 记录数
   *  - pointsConsumed: 时间范围内 type=CONSUME 的 |amount| 合计
   *  - trends: 按天聚合最近 N 天的 dau / newUsers / gmv
   */
  async getOverview(dto: OverviewQueryDto): Promise<OverviewResult> {
    const range: OverviewRange = dto.range ?? '7d'
    const days = range === '30d' ? 30 : 7

    const { rangeStart, rangeEnd, todayStart, tomorrowStart } = this.buildDateRanges(days)

    // 1. DAU（当天 lastLoginAt 命中用户数）
    const dau = await this.userRepo
      .createQueryBuilder('u')
      .where('u.lastLoginAt >= :start AND u.lastLoginAt < :end', {
        start: todayStart,
        end: tomorrowStart,
      })
      .getCount()

    // 2. 新增用户（时间范围内 createdAt）
    const newUsers = await this.userRepo
      .createQueryBuilder('u')
      .where('u.createdAt >= :start AND u.createdAt < :end', {
        start: rangeStart,
        end: rangeEnd,
      })
      .getCount()

    // 3. GMV（PAID 订单金额合计）
    const gmvRow = await this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.amount), 0)', 'total')
      .where('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('o.createdAt >= :start AND o.createdAt < :end', {
        start: rangeStart,
        end: rangeEnd,
      })
      .getRawOne<SumAggregate>()
    const gmv = Number(gmvRow?.total ?? 0)

    // 4. 生成量（时间范围内 works 记录数）
    const generationCount = await this.workRepo
      .createQueryBuilder('w')
      .where('w.createdAt >= :start AND w.createdAt < :end', {
        start: rangeStart,
        end: rangeEnd,
      })
      .getCount()

    // 5. 积分消耗（type=CONSUME 的 amount 合计绝对值）
    const pointsRow = await this.pointTxRepo
      .createQueryBuilder('tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'total')
      .where('tx.type = :type', { type: PointTransactionType.CONSUME })
      .andWhere('tx.createdAt >= :start AND tx.createdAt < :end', {
        start: rangeStart,
        end: rangeEnd,
      })
      .getRawOne<SumAggregate>()
    const pointsConsumed = Math.abs(Number(pointsRow?.total ?? 0))

    // 6. 趋势（按天聚合）
    const dates = this.buildDateLabels(todayStart, days)
    const [dauTrend, newUsersTrend, gmvTrend] = await Promise.all([
      this.aggregateDauTrend(rangeStart, rangeEnd),
      this.aggregateNewUsersTrend(rangeStart, rangeEnd),
      this.aggregateGmvTrend(rangeStart, rangeEnd),
    ])

    return {
      dau,
      newUsers,
      gmv,
      generationCount,
      pointsConsumed,
      trends: {
        dates,
        dau: this.fillTrend(dates, dauTrend),
        newUsers: this.fillTrend(dates, newUsersTrend),
        gmv: this.fillTrend(dates, gmvTrend),
      },
    }
  }

  // -------------------- 积分流水查询 --------------------

  /**
   * 积分流水分页查询
   *
   * 从 billing 库 point_transactions 表查询，支持 userId / startDate / endDate 筛选。
   * 返回字段：id / userId / type / amount / balance / source(description) / createdAt
   * 按 createdAt 降序排列。
   */
  async getPointsFlow(dto: PointsFlowQueryDto): Promise<PaginatedPointsFlow> {
    const { page, pageSize, userId, startDate, endDate } = dto
    const skip = (page - 1) * pageSize

    const qb = this.pointTxRepo
      .createQueryBuilder('tx')
      .select([
        'tx.id',
        'tx.userId',
        'tx.type',
        'tx.amount',
        'tx.balance',
        'tx.description',
        'tx.createdAt',
      ])

    if (userId) {
      qb.andWhere('tx.userId = :userId', { userId })
    }
    if (startDate) {
      qb.andWhere('tx.createdAt >= :startDate', {
        startDate: new Date(startDate),
      })
    }
    if (endDate) {
      qb.andWhere('tx.createdAt <= :endDate', {
        endDate: new Date(endDate),
      })
    }

    qb.orderBy('tx.createdAt', 'DESC').skip(skip).take(pageSize)

    const [rows, total] = await qb.getManyAndCount()

    const list: PointsFlowItem[] = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      type: r.type,
      amount: r.amount,
      balance: r.balance,
      source: r.description,
      createdAt: r.createdAt,
    }))

    return { list, page, pageSize, total }
  }

  // -------------------- 趋势聚合 --------------------

  /** DAU 趋势：按 lastLoginAt 聚合到天 */
  private async aggregateDauTrend(start: Date, end: Date): Promise<Map<string, number>> {
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .select('DATE(u.lastLoginAt)', 'day')
      .addSelect('COUNT(*)', 'count')
      .where('u.lastLoginAt >= :start AND u.lastLoginAt < :end', { start, end })
      .groupBy('DATE(u.lastLoginAt)')
      .getRawMany<DailyAggregateRow>()
    return this.toMap(rows)
  }

  /** 新增用户趋势：按 createdAt 聚合到天 */
  private async aggregateNewUsersTrend(start: Date, end: Date): Promise<Map<string, number>> {
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .select('DATE(u.createdAt)', 'day')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt >= :start AND u.createdAt < :end', { start, end })
      .groupBy('DATE(u.createdAt)')
      .getRawMany<DailyAggregateRow>()
    return this.toMap(rows)
  }

  /** GMV 趋势：按 PAID 订单 createdAt 聚合金额到天 */
  private async aggregateGmvTrend(start: Date, end: Date): Promise<Map<string, number>> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('DATE(o.createdAt)', 'day')
      .addSelect('COALESCE(SUM(o.amount), 0)', 'total')
      .where('o.status = :status', { status: OrderStatus.PAID })
      .andWhere('o.createdAt >= :start AND o.createdAt < :end', { start, end })
      .groupBy('DATE(o.createdAt)')
      .getRawMany<DailyGmvRow>()
    const map = new Map<string, number>()
    for (const r of rows) {
      map.set(this.formatDate(this.normalizeDay(r.day)), Number(r.total ?? 0))
    }
    return map
  }

  // -------------------- 工具方法 --------------------

  /** 构造时间范围：rangeStart ~ rangeEnd（不含上界），todayStart / tomorrowStart */
  private buildDateRanges(days: number): {
    rangeStart: Date
    rangeEnd: Date
    todayStart: Date
    tomorrowStart: Date
  } {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)

    const rangeStart = new Date(todayStart)
    rangeStart.setDate(rangeStart.getDate() - (days - 1))
    const rangeEnd = tomorrowStart // 时间范围上界（不含）

    return { rangeStart, rangeEnd, todayStart, tomorrowStart }
  }

  /** 构造日期标签数组（YYYY-MM-DD），从最早到今天 */
  private buildDateLabels(todayStart: Date, days: number): string[] {
    const labels: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(todayStart)
      d.setDate(d.getDate() - i)
      labels.push(this.formatDate(d))
    }
    return labels
  }

  /** 将聚合结果行转为 Map<日期标签, 数值> */
  private toMap(rows: DailyAggregateRow[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const r of rows) {
      map.set(this.formatDate(this.normalizeDay(r.day)), Number(r.count ?? 0))
    }
    return map
  }

  /** 用标签数组填充趋势，缺失天补 0 */
  private fillTrend(dates: string[], map: Map<string, number>): number[] {
    return dates.map((d) => map.get(d) ?? 0)
  }

  /** 规范化 day 字段为 Date（兼容 Date / string） */
  private normalizeDay(day: Date | string): Date {
    if (day instanceof Date) {
      return day
    }
    // PostgreSQL DATE() 返回字符串，可能含时区，直接 new Date 解析
    return new Date(day)
  }

  /** 格式化日期为 YYYY-MM-DD（本地时区） */
  private formatDate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}
