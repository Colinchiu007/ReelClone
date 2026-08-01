import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** 要投影到 billing 库的账务操作类型。 */
export enum BillingProjectionType {
  FREEZE = 'FREEZE',
  SETTLE = 'SETTLE',
  RELEASE = 'RELEASE',
}

/** outbox 投影交付状态。 */
export enum BillingProjectionDeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  DEAD = 'DEAD',
}

/**
 * main 到 billing 的事务性 outbox。
 *
 * reservationId、userId 和 workId 都是逻辑关联字段。投影器必须以
 * idempotencyKey 重放；即使 billing 已写入而本记录尚未标记 DELIVERED，
 * 重试也必须能够安全收敛。
 */
@Entity('billing_projection_outbox')
@Index('UQ_billing_projection_outbox_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('UQ_billing_projection_outbox_freeze_reservation', ['reservationId'], {
  unique: true,
  where: '"type" = \'FREEZE\'',
})
@Index('UQ_billing_projection_outbox_terminal_reservation', ['reservationId'], {
  unique: true,
  where: "\"type\" IN ('SETTLE', 'RELEASE')",
})
@Index('IDX_billing_projection_outbox_delivery_created', ['deliveryStatus', 'createdAt'])
@Index('IDX_billing_projection_outbox_reservation_type', ['reservationId', 'type'])
@Index('IDX_billing_projection_outbox_claim', ['deliveryStatus', 'nextAttemptAt', 'leaseExpiresAt'])
export class BillingProjectionOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 权威预留 ID（main 库逻辑关联）。 */
  @Column({ type: 'uuid' })
  reservationId: string

  /** 所属用户 ID。 */
  @Column({ type: 'uuid' })
  userId: string

  /** 所属作品 ID。 */
  @Column({ type: 'uuid' })
  workId: string

  /** 要写入 billing 库的流水类型。 */
  @Column({ type: 'enum', enum: BillingProjectionType })
  type: BillingProjectionType

  /** 预留金额，始终为正数；最终流水符号由 type 决定。 */
  @Column({ type: 'int' })
  amount: number

  /** 本次主库状态变更后的可用余额快照。 */
  @Column({ type: 'int' })
  balanceSnapshot: number

  /** billing 流水的稳定幂等键，同一投影键全局唯一。 */
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string

  @Column({
    type: 'enum',
    enum: BillingProjectionDeliveryStatus,
    default: BillingProjectionDeliveryStatus.PENDING,
  })
  deliveryStatus: BillingProjectionDeliveryStatus

  /** billing 投影确认完成的时间。 */
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null

  /** 已尝试投影次数（含成功那次）。 */
  @Column({ type: 'int', default: 0 })
  attempts: number

  /** 下次允许尝试的时间（指数退避）。NULL 表示可立即尝试。 */
  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null

  /** 最近一次失败原因。 */
  @Column({ type: 'text', nullable: true })
  lastError: string | null

  /** 当前持有租约的 dispatcher 实例 ID。NULL 表示无租约。 */
  @Column({ type: 'uuid', nullable: true })
  leaseOwner: string | null

  /** 租约到期时间。NULL 表示无租约。 */
  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
