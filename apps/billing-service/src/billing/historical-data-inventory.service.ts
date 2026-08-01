import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  CreditOperation,
  CreditOperationOutbox,
  CreditOperationStatus,
  CreditReservation,
  CreditReservationStatus,
  BillingProjectionOutbox,
  BillingProjectionDeliveryStatus,
  PointTransaction,
  PointTransactionType,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { DataSource } from 'typeorm'

/**
 * 历史数据 Inventory 结果
 *
 * 只读审计，不做任何写入。用于：
 * 1. 发现无法证明关联的记录
 * 2. 识别数据不一致
 * 3. 生成人工 reconciliation case
 */
export interface InventoryResult {
  /** 审计时间 */
  auditTime: Date
  /** 总体健康状态 */
  healthy: boolean
  /** 各表记录数 */
  counts: {
    creditOperations: number
    creditReservations: number
    billingProjections: number
    creditOperationOutbox: number
    pointTransactions: number
  }
  /** 发现的问题 */
  issues: InventoryIssue[]
  /** 需要人工 reconciliation 的记录 */
  reconciliationCases: ReconciliationCase[]
}

export interface InventoryIssue {
  severity: 'ERROR' | 'WARN' | 'INFO'
  category: string
  message: string
  /** 涉及的实体 ID 列表 */
  affectedIds: string[]
}

export interface ReconciliationCase {
  reason: string
  /** 涉及的表和 ID */
  records: Array<{ table: string; id: string }>
  /** 额外上下文 */
  context: Record<string, unknown>
}

/**
 * 历史数据只读审计服务
 *
 * 设计原则：
 * - 只读，不修改任何数据
 * - 不根据金额/描述猜测关联
 * - 无法证明关联的记录进入人工 reconciliation case
 * - 禁止按金额/描述猜测跨库关联
 */
@Injectable()
export class HistoricalDataInventoryService {
  private readonly logger = new Logger(HistoricalDataInventoryService.name)

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    @InjectDataSource(DATABASE_CONNECTIONS.BILLING)
    private readonly billingDataSource: DataSource,
  ) {}

  /**
   * 执行完整的只读审计
   */
  async runInventory(): Promise<InventoryResult> {
    this.logger.log('开始历史数据只读审计...')
    const startTime = Date.now()

    const [counts, issues, reconciliationCases] = await Promise.all([
      this.getCounts(),
      this.findIssues(),
      this.findReconciliationCases(),
    ])

    const healthy = issues.filter((i) => i.severity === 'ERROR').length === 0

    const result: InventoryResult = {
      auditTime: new Date(),
      healthy,
      counts,
      issues,
      reconciliationCases,
    }

    const elapsed = Date.now() - startTime
    this.logger.log(
      `审计完成: healthy=${healthy} issues=${issues.length} cases=${reconciliationCases.length} (${elapsed}ms)`,
    )

    return result
  }

  /**
   * 获取各表记录数
   */
  private async getCounts(): Promise<InventoryResult['counts']> {
    const mainRepo = (table: string) => this.mainDataSource.getRepository(table)
    const billingRepo = (table: string) => this.billingDataSource.getRepository(table)

    const [creditOperations, creditReservations, billingProjections, creditOperationOutbox, pointTransactions] =
      await Promise.all([
        mainRepo(CreditOperation).count(),
        mainRepo(CreditReservation).count(),
        mainRepo(BillingProjectionOutbox).count(),
        mainRepo(CreditOperationOutbox).count(),
        billingRepo(PointTransaction).count(),
      ])

    return { creditOperations, creditReservations, billingProjections, creditOperationOutbox, pointTransactions }
  }

  /**
   * 发现数据不一致问题
   */
  private async findIssues(): Promise<InventoryIssue[]> {
    const issues: InventoryIssue[] = []

    // 1. 检查 DEAD 状态的 outbox 记录
    const deadProjections = await this.mainDataSource
      .getRepository(BillingProjectionOutbox)
      .find({ where: { deliveryStatus: BillingProjectionDeliveryStatus.DEAD } })

    if (deadProjections.length > 0) {
      issues.push({
        severity: 'ERROR',
        category: 'DEAD_OUTBOX',
        message: `发现 ${deadProjections.length} 条 DEAD 状态的 billing projection outbox 记录`,
        affectedIds: deadProjections.map((p) => p.id),
      })
    }

    // 2. 检查 DEAD 状态的 credit operation outbox
    const deadOpOutbox = await this.mainDataSource
      .getRepository(CreditOperationOutbox)
      .find({ where: { status: CreditOperationStatus.DEAD as any } })

    if (deadOpOutbox.length > 0) {
      issues.push({
        severity: 'ERROR',
        category: 'DEAD_OPERATION_OUTBOX',
        message: `发现 ${deadOpOutbox.length} 条 DEAD 状态的 credit operation outbox 记录`,
        affectedIds: deadOpOutbox.map((o) => o.id),
      })
    }

    // 3. 检查长时间 OPEN 的 reservation（>24h）
    const staleReservations = await this.mainDataSource
      .getRepository(CreditReservation)
      .createQueryBuilder('r')
      .where('r.status = :status', { status: CreditReservationStatus.OPEN })
      .andWhere('r.createdAt < NOW() - INTERVAL \'24 hours\'')
      .getMany()

    if (staleReservations.length > 0) {
      issues.push({
        severity: 'WARN',
        category: 'STALE_OPEN_RESERVATION',
        message: `发现 ${staleReservations.length} 条超过 24 小时仍为 OPEN 的 reservation`,
        affectedIds: staleReservations.map((r) => r.id),
      })
    }

    // 4. 检查 PENDING 超过 1 小时的 billing projection
    const stalePendingProjections = await this.mainDataSource
      .getRepository(BillingProjectionOutbox)
      .createQueryBuilder('b')
      .where('b.deliveryStatus = :status', { status: BillingProjectionDeliveryStatus.PENDING })
      .andWhere('b.createdAt < NOW() - INTERVAL \'1 hour\'')
      .getMany()

    if (stalePendingProjections.length > 0) {
      issues.push({
        severity: 'WARN',
        category: 'STALE_PENDING_PROJECTION',
        message: `发现 ${stalePendingProjections.length} 条超过 1 小时仍为 PENDING 的 billing projection`,
        affectedIds: stalePendingProjections.map((p) => p.id),
      })
    }

    // 5. 检查 PENDING 状态的 credit operation（无终态）
    const pendingOperations = await this.mainDataSource
      .getRepository(CreditOperation)
      .find({ where: { status: CreditOperationStatus.PENDING } })

    if (pendingOperations.length > 0) {
      issues.push({
        severity: 'WARN',
        category: 'PENDING_OPERATION',
        message: `发现 ${pendingOperations.length} 条 PENDING 状态的 credit operation（无终态）`,
        affectedIds: pendingOperations.map((o) => o.id),
      })
    }

    return issues
  }

  /**
   * 发现需要人工 reconciliation 的记录
   *
   * 设计原则：
   * - 不根据金额/描述猜测关联
   * - 只标记无法证明关联的记录
   * - 无法证明关联的记录进入人工 case
   */
  private async findReconciliationCases(): Promise<ReconciliationCase[]> {
    const cases: ReconciliationCase[] = []

    // 1. 找出 main 库中没有对应 billing 投影的 reservation
    // （reservation 是 OPEN 但 billing projection 已 DELIVERED，或者反过来）
    const openReservationsWithoutProjection = await this.mainDataSource
      .getRepository(CreditReservation)
      .createQueryBuilder('r')
      .leftJoin(
        BillingProjectionOutbox,
        'bpo',
        'bpo.reservation_id = r.id AND bpo.type = \'FREEZE\'',
      )
      .where('r.status = :status', { status: CreditReservationStatus.OPEN })
      .andWhere('bpo.id IS NULL')
      .getMany()

    if (openReservationsWithoutProjection.length > 0) {
      cases.push({
        reason: 'OPEN reservation 没有对应的 FREEZE billing projection — 无法证明积分冻结是否已投影到 billing 库',
        records: openReservationsWithoutProjection.map((r) => ({ table: 'credit_reservations', id: r.id })),
        context: {
          count: openReservationsWithoutProjection.length,
          note: '禁止根据金额猜测，需人工核实 billing 库 point_transactions 中是否存在对应记录',
        },
      })
    }

    // 2. 找出 billing 库中没有对应 main 库 reservation 的 FREEZE/SETTLE/RELEASE 交易
    // （billing 有交易但 main 没有对应 reservation）
    const orphanBillingTransactions = await this.billingDataSource
      .getRepository(PointTransaction)
      .createQueryBuilder('pt')
      .leftJoin(
        CreditReservation,
        'cr',
        'cr.id = pt.reservation_id',
      )
      .where('pt.type IN (:...types)', {
        types: [PointTransactionType.FREEZE, PointTransactionType.SETTLE, PointTransactionType.RELEASE],
      })
      .andWhere('pt.reservation_id IS NOT NULL')
      .andWhere('cr.id IS NULL')
      .getMany()

    if (orphanBillingTransactions.length > 0) {
      cases.push({
        reason: 'billing 库 FREEZE/SETTLE/RELEASE 交易指向不存在的 reservation — 无法证明关联',
        records: orphanBillingTransactions.map((t) => ({ table: 'point_transactions', id: t.id })),
        context: {
          count: orphanBillingTransactions.length,
          note: '需人工核实 main 库 credit_reservations 和 credit_operations 是否有对应记录',
        },
      })
    }

    // 3. 找出 credit operation 没有对应 outbox 的情况
    const operationsWithoutOutbox = await this.mainDataSource
      .getRepository(CreditOperation)
      .createQueryBuilder('co')
      .leftJoin(
        CreditOperationOutbox,
        'coo',
        'coo.credit_operation_id = co.id',
      )
      .where('coo.id IS NULL')
      .getMany()

    if (operationsWithoutOutbox.length > 0) {
      cases.push({
        reason: 'credit operation 没有对应的 outbox 记录 — 事件可能未投递或已丢失',
        records: operationsWithoutOutbox.map((o) => ({ table: 'credit_operations', id: o.id })),
        context: {
          count: operationsWithoutOutbox.length,
          note: '需人工核实 billing 库 point_transactions 是否有对应记录',
        },
      })
    }

    // 4. 找出 DELIVERED 但 reservation 已非 OPEN 的情况（可能正常，但需确认）
    const deliveredButNotOpen = await this.mainDataSource
      .getRepository(BillingProjectionOutbox)
      .createQueryBuilder('bpo')
      .leftJoin(
        CreditReservation,
        'cr',
        'cr.id = bpo.reservation_id',
      )
      .where('bpo.delivery_status = :status', { status: BillingProjectionDeliveryStatus.DELIVERED })
      .andWhere('bpo.type = :type', { type: 'FREEZE' })
      .andWhere('cr.status != :status', { status: CreditReservationStatus.OPEN })
      .andWhere('cr.id IS NOT NULL')
      .getMany()

    if (deliveredButNotOpen.length > 0) {
      cases.push({
        reason: 'FREEZE 投影已 DELIVERED 但 reservation 非 OPEN — 状态转换可能不一致',
        records: deliveredButNotOpen.map((p) => ({ table: 'billing_projection_outbox', id: p.id })),
        context: {
          count: deliveredButNotOpen.length,
          note: '需人工确认 reservation 状态转换是否正确',
        },
      })
    }

    return cases
  }
}
