/**
 * OutboxConsumer — paid-grant outbox 投递消费者
 *
 * 职责：
 *  1. 定期捞取 credit_operation_outbox 中 PENDING 记录（5 秒间隔）
 *  2. 使用 lease 机制（leaseOwner + leaseExpiresAt）防止多实例并发重复投递
 *  3. 调用 billing-service grant 接口（幂等键 order:{orderId}:grant）
 *  4. 成功 → outbox DELIVERED + operation CONFIRMED
 *  5. 失败 → attempts++、指数退避（nextAttemptAt）、记录 lastError
 *  6. 超过最大重试次数（10 次）→ outbox DEAD + operation DEAD，触发告警日志
 *
 * 幂等保证：
 *  - billing-service 自身基于 idempotencyKey 幂等，consumer 与即时调用重放安全
 *  - lease 机制避免多实例并发处理同一记录
 *
 * 不依赖 @nestjs/schedule，使用 setInterval + NestJS 生命周期钩子，避免引入新依赖。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import {
  CreditOperation,
  CreditOperationOutbox,
  CreditOperationStatus,
  DATABASE_CONNECTIONS,
  OutboxStatus,
} from '@reelclone/database'
import { BillingClient } from './billing.client'

/** 捞取间隔（毫秒） */
const POLL_INTERVAL_MS = 5000

/** 单批捞取上限 */
const BATCH_SIZE = 50

/** 租约时长（毫秒）：租约期内其他实例不会重复处理 */
const LEASE_TTL_MS = 30_000

/** 最大重试次数，超过后标记为 DEAD */
const MAX_ATTEMPTS = 10

/** 退避基数（毫秒），实际退避 = BASE * 2^attempts，上限 1 小时 */
const BACKOFF_BASE_MS = 5_000

/** 退避上限（毫秒，1 小时） */
const BACKOFF_MAX_MS = 3_600_000

/** outbox 事件载荷结构 */
interface GrantEventPayload {
  type: string
  relatedOrderId: string
  userId: string
  packageId: string
  amount: number
  idempotencyKey: string
  orderNo?: string
}

/** 计算指数退避时间（毫秒） */
export function computeBackoffMs(attempts: number): number {
  const backoff = BACKOFF_BASE_MS * Math.pow(2, attempts)
  return Math.min(backoff, BACKOFF_MAX_MS)
}

@Injectable()
export class OutboxConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxConsumer.name)

  /** 当前实例的租约 owner token（用于 claim 标识） */
  private readonly ownerToken = uuidv4()

  /** setInterval 句柄 */
  private timer: NodeJS.Timeout | null = null

  /** 防止并发执行（上一次未跑完不重启） */
  private running = false

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
    private readonly billingClient: BillingClient,
  ) {}

  onModuleInit(): void {
    this.logger.log(`OutboxConsumer 启动，轮询间隔 ${POLL_INTERVAL_MS}ms，owner=${this.ownerToken}`)
    this.timer = setInterval(() => {
      this.processOnce().catch((err) => {
        this.logger.error(
          `OutboxConsumer 轮询异常: ${(err as Error).message}`,
          (err as Error).stack,
        )
      })
    }, POLL_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      this.logger.log('OutboxConsumer 已停止')
    }
  }

  /**
   * 执行一次捞取 + 投递循环。可被外部（含测试）直接调用。
   */
  async processOnce(): Promise<void> {
    if (this.running) {
      return
    }
    this.running = true
    try {
      const claimed = await this.claimBatch(BATCH_SIZE)
      for (const outbox of claimed) {
        await this.deliverOne(outbox)
      }
    } finally {
      this.running = false
    }
  }

  /**
   * 原子捞取一批 PENDING 记录并设置租约。
   *
   * 使用 UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *
   * 实现并发安全的 claim：
   *  - FOR UPDATE SKIP LOCKED 避免多实例阻塞
   *  - leaseExpiresAt 判断避免重复处理已被认领但未完成的记录
   *  - nextAttemptAt 判断跳过尚未到退避时间的记录
   */
  async claimBatch(limit: number): Promise<CreditOperationOutbox[]> {
    const leaseExpiresAt = new Date(Date.now() + LEASE_TTL_MS)
    const rows: CreditOperationOutbox[] = await this.mainDataSource.query(
      `UPDATE credit_operation_outbox
       SET lease_owner = $1, lease_expires_at = $2, updated_at = NOW()
       WHERE id IN (
         SELECT id FROM credit_operation_outbox
         WHERE status = 'PENDING'
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
   * 投递单条 outbox 记录。
   *
   * 成功 → outbox DELIVERED + operation CONFIRMED
   * 失败（attempts < MAX）→ attempts++、指数退避、记录 lastError
   * 失败（attempts >= MAX）→ outbox DEAD + operation DEAD，告警
   */
  async deliverOne(outbox: CreditOperationOutbox): Promise<void> {
    const payload = outbox.eventPayload as unknown as GrantEventPayload
    if (!payload || !payload.userId || !payload.idempotencyKey) {
      this.logger.error(`outbox ${outbox.id} eventPayload 缺失必要字段，直接标记 DEAD`)
      await this.markDead(outbox, 'eventPayload 缺失必要字段（userId/idempotencyKey）')
      return
    }

    const grantParams = {
      userId: payload.userId,
      amount: Number(payload.amount),
      idempotencyKey: payload.idempotencyKey,
      orderId: payload.relatedOrderId,
      packageId: payload.packageId,
    }

    try {
      await this.billingClient.grant(grantParams)
      await this.markDelivered(outbox)
      this.logger.log(
        `outbox ${outbox.id}（order=${payload.relatedOrderId}）投递成功，已标记 DELIVERED`,
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await this.markFailed(outbox, errMsg)
    }
  }

  /**
   * 标记投递成功：outbox DELIVERED + operation CONFIRMED，并释放租约。
   */
  private async markDelivered(outbox: CreditOperationOutbox): Promise<void> {
    const outboxRepo = this.mainDataSource.getRepository(CreditOperationOutbox)
    const operationRepo = this.mainDataSource.getRepository(CreditOperation)

    await outboxRepo.update(
      { id: outbox.id },
      {
        status: OutboxStatus.DELIVERED,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    )

    if (outbox.creditOperationId) {
      await operationRepo.update(
        { id: outbox.creditOperationId },
        { status: CreditOperationStatus.CONFIRMED },
      )
    }
  }

  /**
   * 标记投递失败：增加 attempts、设置指数退避 nextAttemptAt、记录 lastError。
   * 超过 MAX_ATTEMPTS 则标记 DEAD。
   */
  private async markFailed(outbox: CreditOperationOutbox, errMsg: string): Promise<void> {
    const nextAttempts = outbox.attempts + 1

    if (nextAttempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `outbox ${outbox.id} 达到最大重试次数 ${MAX_ATTEMPTS}，标记为 DEAD: ${errMsg}`,
      )
      await this.markDead(outbox, errMsg)
      return
    }

    const backoffMs = computeBackoffMs(nextAttempts)
    const nextAttemptAt = new Date(Date.now() + backoffMs)

    const outboxRepo = this.mainDataSource.getRepository(CreditOperationOutbox)
    await outboxRepo.update(
      { id: outbox.id },
      {
        attempts: nextAttempts,
        nextAttemptAt,
        lastError: errMsg,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    )

    this.logger.warn(
      `outbox ${outbox.id} 投递失败（第 ${nextAttempts}/${MAX_ATTEMPTS} 次），${backoffMs}ms 后重试: ${errMsg}`,
    )
  }

  /**
   * 标记为 DEAD：outbox DEAD + operation DEAD，并释放租约。触发告警日志。
   */
  private async markDead(outbox: CreditOperationOutbox, errMsg: string): Promise<void> {
    const outboxRepo = this.mainDataSource.getRepository(CreditOperationOutbox)
    const operationRepo = this.mainDataSource.getRepository(CreditOperation)

    await outboxRepo.update(
      { id: outbox.id },
      {
        status: OutboxStatus.DEAD,
        attempts: outbox.attempts + 1,
        lastError: errMsg,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    )

    if (outbox.creditOperationId) {
      await operationRepo.update(
        { id: outbox.creditOperationId },
        { status: CreditOperationStatus.DEAD },
      )
    }

    // 告警：DEAD 记录需人工介入
    this.logger.error(
      `【告警】outbox ${outbox.id}（operationId=${outbox.operationId}）已标记 DEAD，需人工介入: ${errMsg}`,
    )
  }
}
