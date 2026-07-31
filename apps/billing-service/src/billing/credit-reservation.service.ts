import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
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
import { DataSource } from 'typeorm'
import { LedgerService } from './ledger.service'

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

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    private readonly ledger: LedgerService,
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

  async projectPending(limit = 100): Promise<void> {
    const outboxRepo = this.mainDataSource.getRepository(BillingProjectionOutbox)
    const pending = await outboxRepo
      .createQueryBuilder('outbox')
      .where('outbox.deliveryStatus = :status', {
        status: BillingProjectionDeliveryStatus.PENDING,
      })
      // 失败项会更新 updatedAt，避免固定的前 N 条永久阻塞后续事件。
      .orderBy('outbox.updatedAt', 'ASC')
      .take(limit)
      .getMany()

    for (const outbox of pending) {
      try {
        await this.projectOutbox(outbox.id)
      } catch (err) {
        this.logger.error(
          `账务投影失败 outboxId=${outbox.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
        await this.deferOutbox(outbox.id)
      }
    }
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
   * 以 main 库行锁领取单条 outbox，并在锁持有期间完成 billing 投影。
   * 进程崩溃时事务回滚为 PENDING，billing 幂等键保证重放不会重复记账。
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

      await outboxRepo.update(
        { id: outbox.id, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
        { deliveryStatus: BillingProjectionDeliveryStatus.DELIVERED, deliveredAt: new Date() },
      )
      if (outbox.type !== BillingProjectionType.FREEZE) {
        await manager
          .getRepository(CreditReservation)
          .update({ id: outbox.reservationId }, { terminalTransactionId: transaction.id })
      }
      return transaction
    })
  }

  private async deferOutbox(outboxId: string): Promise<void> {
    try {
      await this.mainDataSource
        .getRepository(BillingProjectionOutbox)
        .update(
          { id: outboxId, deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
          { updatedAt: new Date() },
        )
    } catch (err) {
      this.logger.warn(
        `账务投影失败项延期更新失败 outboxId=${outboxId}: ${err instanceof Error ? err.message : String(err)}`,
      )
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
