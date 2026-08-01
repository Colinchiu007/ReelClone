import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** 支付事件处理状态 */
export enum PaymentEventStatus {
  /** 已接收原始回调（验签通过后写入） */
  RECEIVED = 'RECEIVED',
  /** 已成功处理（订单已更新为 PAID，积分已赠送） */
  PROCESSED = 'PROCESSED',
  /** 处理失败（字段绑定不匹配 / 订单不存在 / 其他异常） */
  FAILED = 'FAILED',
  /** 幂等跳过（同一 transaction_id 已处理过） */
  DUPLICATED = 'DUPLICATED',
}

/**
 * 订单支付事件实体（durable inbox 模式）
 *
 * 每次微信支付回调验签通过后，先将原始事件落库（RECEIVED），
 * 再由 OrderService 处理。处理完成后更新状态为 PROCESSED / FAILED。
 *
 * transactionId 上的唯一索引保证同一微信支付流水号不会被重复处理：
 *  - 并发回调时第二个插入会因唯一约束失败 → 幂等返回
 *  - 重放回调时查询到已 PROCESSED → 幂等返回
 *
 * 这构成「durable inbox」：事件先持久化再处理，即使处理过程中崩溃，
 * 重启后仍可查询 RECEIVED 状态的事件进行补偿。
 */
@Entity('order_payment_events')
@Index('IDX_order_payment_events_order_no', ['orderNo'])
@Index('IDX_order_payment_events_status', ['status'])
@Index('UQ_order_payment_events_transaction_id', ['transactionId'], {
  unique: true,
  where: '"transaction_id" IS NOT NULL',
})
export class OrderPaymentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 关联订单 ID（nullable：订单不存在时仍记录事件便于排查） */
  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId: string | null

  /** 商户订单号（out_trade_no） */
  @Column({ type: 'varchar', length: 32, name: 'order_no' })
  orderNo: string

  /** 微信支付流水号（transaction_id，唯一约束保证幂等） */
  @Column({ type: 'varchar', length: 64, name: 'transaction_id', nullable: true })
  transactionId: string | null

  /** 微信支付事件类型（如 TRANSACTION.SUCCESS） */
  @Column({ type: 'varchar', length: 64, name: 'event_type', nullable: true })
  eventType: string | null

  /** 微信支付事件 ID（回调 body.id） */
  @Column({ type: 'varchar', length: 64, name: 'notification_id', nullable: true })
  notificationId: string | null

  /** 原始回调 body（验签用的 raw body，JSON 字符串） */
  @Column({ type: 'text', name: 'raw_body' })
  rawBody: string

  /** 验签是否通过 */
  @Column({ type: 'boolean', name: 'verified', default: false })
  verified: boolean

  /** 处理状态 */
  @Column({ type: 'varchar', length: 20, name: 'status', default: 'RECEIVED' })
  status: PaymentEventStatus

  /** 处理完成时间 */
  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processedAt: Date | null

  /** 解密后的支付结果（JSON） */
  @Column({ type: 'jsonb', name: 'decrypt_result', nullable: true })
  decryptResult: Record<string, unknown> | null

  /** 处理失败原因 */
  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date
}
