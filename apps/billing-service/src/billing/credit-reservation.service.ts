import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { Counter, Histogram } from 'prom-client'
import { randomUUID } from 'node:crypto'
import { BusinessException } from '@reelclone/common'
import {
  BillingProjectionDeliveryStatus,
  BillingProjectionOutbox,
  BillingProjectionType,
  CreditReservation,
  CreditReservationStatus,
  DATABASE_CONNECTIONS,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'
import { OUTBOX_PROJECTED_TOTAL, OUTBOX_CLAIM_BATCH_SIZE } from '@reelclone/observability'
import { DataSource } from 'typeorm'
import { LedgerService } from './ledger.service'

/** 指数退避基数（毫秒）。 */
const BACKOFF_BASE_MS = 5_000
/** 退避上限（毫秒）— 1 小时。 */
const BACKOFF_MAX_MS = 3_600_000
/** 租约存活时间（毫秒）。 */
const LEASE_TTL_MS = 30_000
/** 最大重试次数，超过后标记 DEAD。 */
const MAX_ATTEMPTS = 10

/** 计算指数退避延迟。 */
export function computeBackoffMs(attempts: number): number {
  const backoff = BACKOFF_BASE_MS * Math.pow(2, attempts)
  return Math.min(backoff, BACKOFF_MAX_MS)
}

/** outbox inspect 结果（供运维工具使用）。 */
export interface OutboxInspectResult {
  id: string
  reservationId: string
  type: string
  deliveryStatus: string
  attempts: number
  nextAttemptAt: Date | null
  lastError: string | null
  leaseOwner: string | null
  leaseExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface FreezeReservationParams {
  userId: string
  workId: string
  amount: number
  idempotencyKey: string
  description?: string
}

interface TerminalReservationParams {
  userId: string
  workId?: string | null
  amount: number
  idempotencyKey: string
  freezeId: string
  description?: string
}

export interface ReservationOperationResult {
  transactionId: string
  balance: number
  /** 仅保留给旧的内部调用者；V2 写操作不依赖跨库冻结统计。 */
  frozen?: number
}

/**
 * 生成链路的 V2 预留账务。
 *
 * main 库中的 CreditReservation 是唯一权威状态：余额、OPEN/终态切换和 outbox
 * 在同一事务提交；billing 库仅由 outbox 至少一次投影，不能反向决定余额是否已变更。
 */
@Injectable()
export class CreditReservationService {
  private readonly logger = new Logger(CreditReservationService.name)
  private readonly ownerToken = randomUUID()

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    private readonly ledger: LedgerService,
    @Inject(OUTBOX_PROJECTED_TOTAL) private readonly outboxProjected: Counter<string>,
    @Inject(OUTBOX_CLAIM_BATCH_SIZE) private readonly outboxClaimBatchSize: Histogram<string>,
  ) {}

  async freeze(params: FreezeReservationParams): Promise<ReservationOperationResult> {
    const reservation = await this.mainDataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(CreditReservation)
      const outboxRepo = manager.getRepository(BillingProjectionOutbox)
      const user = await this.ledger.lockUser(manager, params.userId)

      const existing = await reservationRepo.findOne({
        where: { freezeOperationKey: params.idempotencyKey },
      })
      if (existing) {
        this.assertFreezeReplay(existing, params)
        return existing
      }

      if (user.currentPoints < params.amount) {
        throw BusinessException.insufficientCredits(
          `积分不足：当前可用 ${user.currentPoints}，需要 ${params.amount}`,
          { current: user.currentPoints, required: params.amount },
        )
      }

      const balanceAfterFreeze = user.currentPoints - params.amount
      user.currentPoints = balanceAfterFreeze
      await manager.getRepository(User).save(user)

      const created = reservationRepo.create({
        userId: params.userId,
        workId: params.workId,
        amount: params.amount,
        status: CreditReservationStatus.OPEN,
        freezeOperationKey: params.idempotencyKey,
        terminalOperationKey: null,
        terminalTransactionId: null,
        balanceAfterFreeze,
        balanceAfterTerminal: null,
        terminalAt: null,
      })
      const saved = await reservationRepo.save(created)
      await outboxRepo.save(
        outboxRepo.create({
          reservationId: saved.id,
          userId: params.userId,
          workId: params.workId,
          type: BillingProjectionType.FREEZE,
          amount: params.amount,
          balanceSnapshot: balanceAfterFreeze,
          idempotencyKey: params.idempotencyKey,
          deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
          deliveredAt: null,
        }),
      )
      return saved
    })

    // 主库事务已经提交；投影失败或 billing 暂时不可用不能把本次冻结伪装成失败。
    this.scheduleProjection(reservation.id)
    return {
      // V2 的公开 freezeId 是 main 库权威 reservation ID，而不是异步 billing 投影 ID。
      transactionId: reservation.id,
      balance: reservation.balanceAfterFreeze,
    }
  }

  async settle(params: TerminalReservationParams): Promise<ReservationOperationResult> {
    const reservation = await this.transitionTerminal(params, CreditReservationStatus.SETTLED)
    this.scheduleProjection(reservation.id)
    return {
      // terminalTransactionId 由异步投影回写；在投影完成前返回稳定 reservation ID。
      transactionId: reservation.terminalTransactionId ?? reservation.id,
      balance: reservation.balanceAfterTerminal ?? reservation.balanceAfterFreeze,
    }
  }

  async release(params: TerminalReservationParams): Promise<ReservationOperationResult> {
    const reservation = await this.transitionTerminal(params, CreditReservationStatus.RELEASED)
    this.scheduleProjection(reservation.id)
    return {
      transactionId: reservation.terminalTransactionId ?? reservation.id,
      balance: reservation.balanceAfterTerminal ?? reservation.balanceAfterFreeze,
    }
  }

  /** 查找 V2 reservation；不存在时由调用方决定是否走旧接口。 */
  async findReservation(freezeId: string, userId: string): Promise<CreditReservation | null> {
    return this.mainDataSource.getRepository(CreditReservation).findOne({
      where: { id: freezeId, userId },
    })
  }

  /**
   * 每 15 秒由 cron 调度：原子 claim 批量 PENDING outbox → 逐条投影。
   * claim 使用 FOR UPDATE SKIP LOCKED + lease 机制，多实例安全。
   */
  async projectPending(
    limit = 100,
  ): Promise<{ claimed: number; projected: number; failed: number }> {
    const claimed = await this.claimBatch(limit)
    let projected = 0
    let failed = 0

    for (const outbox of claimed) {
      try {
        const result = await this.projectOutbox(outbox.id)
        if (result) projected++
        else failed++
      } catch (err) {
        failed++
        this.logger.error(
          `账务投影失败 outboxId=${outbox.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
        await this.handleFailedOutbox(outbox.id, outbox.attempts, err)
      }
    }

    this.outboxProjected.inc({ result: 'projected' }, projected)
    this.outboxProjected.inc({ result: 'failed' }, failed)
    this.outboxClaimBatchSize.observe(claimed.length)

    return { claimed: claimed.length, projected, failed }
  }

  private async transitionTerminal(
    params: TerminalReservationParams,
    targetStatus: CreditReservationStatus.SETTLED | CreditReservationStatus.RELEASED,
  ): Promise<CreditReservation> {
    return this.mainDataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(CreditReservation)
      const outboxRepo = manager.getRepository(BillingProjectionOutbox)
      const reservation = await reservationRepo
        .createQueryBuilder('reservation')
        .setLock('pessimistic_write')
        .where('reservation.id = :freezeId', { freezeId: params.freezeId })
        .andWhere('reservation.userId = :userId', { userId: params.userId })
        .getOne()

      if (!reservation) {
        throw BusinessException.validationError('旧版积分预留缺少可验证关联，需对账后处理', {
          code: 'LEGACY_RESERVATION_RECONCILIATION_REQUIRED',
          freezeId: params.freezeId,
        })
      }
      if (reservation.amount !== params.amount) {
        throw BusinessException.validationError('积分预留必须按原金额全额结算或释放', {
          freezeId: params.freezeId,
          frozenAmount: reservation.amount,
          requestedAmount: params.amount,
        })
      }
      if (params.workId && reservation.workId !== params.workId) {
        throw BusinessException.validationError('积分预留与作品不匹配', {
          freezeId: params.freezeId,
          workId: params.workId,
        })
      }
      if (reservation.status !== CreditReservationStatus.OPEN) {
        if (
          reservation.status === targetStatus &&
          reservation.terminalOperationKey === params.idempotencyKey
        ) {
          return reservation
        }
        throw BusinessException.validationError('积分预留已经结算或释放', {
          freezeId: params.freezeId,
          status: reservation.status,
        })
      }

      let balanceAfterTerminal = reservation.balanceAfterFreeze
      if (targetStatus === CreditReservationStatus.RELEASED) {
        const user = await this.ledger.lockUser(manager, params.userId)
        balanceAfterTerminal = user.currentPoints + reservation.amount
        user.currentPoints = balanceAfterTerminal
        await manager.getRepository(User).save(user)
      }

      reservation.status = targetStatus
      reservation.terminalOperationKey = params.idempotencyKey
      reservation.balanceAfterTerminal = balanceAfterTerminal
      reservation.terminalAt = new Date()
      const saved = await reservationRepo.save(reservation)
      await outboxRepo.save(
        outboxRepo.create({
          reservationId: saved.id,
          userId: saved.userId,
          workId: saved.workId,
          type:
            targetStatus === CreditReservationStatus.SETTLED
              ? BillingProjectionType.SETTLE
              : BillingProjectionType.RELEASE,
          amount: saved.amount,
          balanceSnapshot: balanceAfterTerminal,
          idempotencyKey: params.idempotencyKey,
          deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
          deliveredAt: null,
        }),
      )
      return saved
    })
  }

  private scheduleProjection(reservationId: string): void {
    void this.tryProjectReservation(reservationId).catch((err) => {
      // 主库状态已提交；任何投影错误都交给下一轮 cron，不传播到写操作响应。
      this.logger.warn(
        `账务投影将异步重试 reservationId=${reservationId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    })
  }

  private async tryProjectReservation(reservationId: string): Promise<PointTransaction | null> {
    const pending = await this.mainDataSource.getRepository(BillingProjectionOutbox).find({
      where: { reservationId, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
      order: { createdAt: 'ASC' },
    })
    let lastTransaction: PointTransaction | null = null
    for (const outbox of pending) {
      const transaction = await this.projectOutbox(outbox.id)
      if (!transaction) break
      lastTransaction = transaction
    }
    return lastTransaction
  }

  /**
   * 原子 claim 批量 PENDING outbox。使用 FOR UPDATE SKIP LOCKED + lease，
   * 多实例并行安全：退避期内或租约未过期的记录不会被其他实例领取。
   */
  private async claimBatch(limit: number): Promise<BillingProjectionOutbox[]> {
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS)
    const rows: BillingProjectionOutbox[] = await this.mainDataSource.query(
      `UPDATE billing_projection_outbox
       SET lease_owner = $1, lease_expires_at = $2, updated_at = NOW()
       WHERE id IN (
         SELECT id FROM billing_projection_outbox
         WHERE delivery_status = 'PENDING'
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
           AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
         ORDER BY next_attempt_at NULLS FIRST, created_at
         LIMIT $3
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [this.ownerToken, leaseExpiresAt, limit],
    )
    return rows
  }

  /**
   * 以 main 库行锁领取单条 outbox，并在锁持有期间完成 billing 投影。
   * 进程崩溃时事务回滚为 PENDING（lease 过期后可被重新领取），
   * billing 幂等键保证重放不会重复记账。
   */
  private async projectOutbox(outboxId: string): Promise<PointTransaction | null> {
    return this.mainDataSource.transaction(async (manager) => {
      const outboxRepo = manager.getRepository(BillingProjectionOutbox)
      const outbox = await outboxRepo
        .createQueryBuilder('outbox')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('outbox.id = :outboxId', { outboxId })
        .andWhere('outbox.deliveryStatus = :status', {
          status: BillingProjectionDeliveryStatus.PENDING,
        })
        .getOne()
      if (!outbox) return null

      // 同一 reservation 必须先投影 FREEZE，再投影 SETTLE/RELEASE。
      if (outbox.type !== BillingProjectionType.FREEZE) {
        const freeze = await outboxRepo.findOne({
          where: {
            reservationId: outbox.reservationId,
            type: BillingProjectionType.FREEZE,
          },
        })
        if (!freeze || freeze.deliveryStatus !== BillingProjectionDeliveryStatus.DELIVERED) {
          return null
        }
      }

      let transaction = await this.ledger.findByIdempotencyKey(outbox.idempotencyKey)
      if (transaction) {
        this.assertProjectionReplay(transaction, outbox)
      } else {
        transaction = await this.ledger.writeTransaction({
          userId: outbox.userId,
          type: outbox.type as unknown as PointTransactionType,
          amount: outbox.type === BillingProjectionType.RELEASE ? outbox.amount : -outbox.amount,
          balanceAfter: outbox.balanceSnapshot,
          idempotencyKey: outbox.idempotencyKey,
          description: `V2 reservation ${outbox.type.toLowerCase()} (${outbox.reservationId})`,
          workId: outbox.workId,
          reservationId: outbox.reservationId,
        })
      }

      // 投影成功：标记 DELIVERED 并释放租约。
      await outboxRepo.update(
        { id: outbox.id, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
        {
          deliveryStatus: BillingProjectionDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )
      if (outbox.type !== BillingProjectionType.FREEZE) {
        await manager
          .getRepository(CreditReservation)
          .update({ id: outbox.reservationId }, { terminalTransactionId: transaction.id })
      }
      return transaction
    })
  }

  /**
   * 投影失败处理：递增 attempts，计算指数退避 nextAttemptAt。
   * 超过 MAX_ATTEMPTS 时标记 DEAD（毒丸）。
   */
  private async handleFailedOutbox(
    outboxId: string,
    currentAttempts: number,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const newAttempts = currentAttempts + 1

    if (newAttempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `账务投影毒丸 outboxId=${outboxId} 已达最大重试 ${MAX_ATTEMPTS} 次，标记 DEAD: ${errorMessage}`,
      )
      await this.markDead(outboxId, errorMessage)
      return
    }

    const nextAttemptAt = new Date(Date.now() + computeBackoffMs(newAttempts))
    try {
      await this.mainDataSource.getRepository(BillingProjectionOutbox).update(
        { id: outboxId, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
        {
          attempts: newAttempts,
          nextAttemptAt,
          lastError: errorMessage,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )
    } catch (err) {
      this.logger.warn(
        `账务投影退避更新失败 outboxId=${outboxId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 标记 outbox 为 DEAD（毒丸终态），释放租约。 */
  private async markDead(outboxId: string, lastError: string): Promise<void> {
    try {
      await this.mainDataSource.getRepository(BillingProjectionOutbox).update(
        { id: outboxId, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
        {
          deliveryStatus: BillingProjectionDeliveryStatus.DEAD,
          lastError,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )
    } catch (err) {
      this.logger.error(
        `标记 DEAD 失败 outboxId=${outboxId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 查询指定 reservation 的所有 outbox 记录（供运维 inspect 使用）。 */
  async inspectOutbox(reservationId: string): Promise<OutboxInspectResult[]> {
    const rows = await this.mainDataSource
      .getRepository(BillingProjectionOutbox)
      .find({ where: { reservationId }, order: { createdAt: 'ASC' } })
    return rows.map((r) => ({
      id: r.id,
      reservationId: r.reservationId,
      type: r.type,
      deliveryStatus: r.deliveryStatus,
      attempts: r.attempts,
      nextAttemptAt: r.nextAttemptAt,
      lastError: r.lastError,
      leaseOwner: r.leaseOwner,
      leaseExpiresAt: r.leaseExpiresAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
  }

  /**
   * 手动重放 DEAD outbox：将状态重置为 PENDING 并清除退避信息。
   * billing 幂等键保证重放不会重复记账，安全调用。
   */
  async replayOutbox(outboxId: string): Promise<void> {
    const repo = this.mainDataSource.getRepository(BillingProjectionOutbox)
    const outbox = await repo.findOne({ where: { id: outboxId } })
    if (!outbox) {
      throw BusinessException.validationError('outbox 记录不存在', { outboxId })
    }
    if (outbox.deliveryStatus !== BillingProjectionDeliveryStatus.DEAD) {
      throw BusinessException.validationError('只能重放 DEAD 状态的 outbox', {
        outboxId,
        currentStatus: outbox.deliveryStatus,
      })
    }
    await repo.update(
      { id: outboxId, deliveryStatus: BillingProjectionDeliveryStatus.DEAD },
      {
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    )
    this.logger.log(
      `手动重放 outboxId=${outboxId} 类型=${outbox.type} reservationId=${outbox.reservationId}`,
    )
  }

  /** 查询 DEAD 状态的 outbox 汇总（供告警和人工排查）。 */
  async getDeadLetterSummary(): Promise<{
    total: number
    oldestCreatedAt: Date | null
    items: OutboxInspectResult[]
  }> {
    const repo = this.mainDataSource.getRepository(BillingProjectionOutbox)
    const deadItems = await repo.find({
      where: { deliveryStatus: BillingProjectionDeliveryStatus.DEAD },
      order: { createdAt: 'ASC' },
      take: 50,
    })
    return {
      total: deadItems.length,
      oldestCreatedAt: deadItems.length > 0 ? deadItems[0].createdAt : null,
      items: deadItems.map((r) => ({
        id: r.id,
        reservationId: r.reservationId,
        type: r.type,
        deliveryStatus: r.deliveryStatus,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        lastError: r.lastError,
        leaseOwner: r.leaseOwner,
        leaseExpiresAt: r.leaseExpiresAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    }
  }

  private assertFreezeReplay(existing: CreditReservation, params: FreezeReservationParams): void {
    if (
      existing.userId !== params.userId ||
      existing.workId !== params.workId ||
      existing.amount !== params.amount
    ) {
      throw BusinessException.validationError('冻结幂等键与原请求参数不一致', {
        idempotencyKey: params.idempotencyKey,
      })
    }
  }

  private assertProjectionReplay(
    transaction: PointTransaction,
    outbox: BillingProjectionOutbox,
  ): void {
    const expectedAmount =
      outbox.type === BillingProjectionType.RELEASE ? outbox.amount : -outbox.amount
    const expectedType = outbox.type as unknown as PointTransactionType
    if (
      transaction.userId !== outbox.userId ||
      transaction.type !== expectedType ||
      transaction.amount !== expectedAmount ||
      transaction.reservationId !== outbox.reservationId
    ) {
      throw BusinessException.taskFailed('账务投影幂等键对应的数据不一致', {
        outboxId: outbox.id,
        transactionId: transaction.id,
      })
    }
  }
}
