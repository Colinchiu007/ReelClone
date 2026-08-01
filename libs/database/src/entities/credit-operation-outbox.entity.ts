import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** outbox 投影交付状态。 */
export enum OutboxStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  DEAD = 'DEAD',
}

/**
 * 计费操作 outbox（main 库）。
 *
 * 每条 CreditOperation 在创建时同步写入一条 outbox 记录，由 dispatcher
 * 拉取 PENDING 任务并投递到 billing 库。支持 claim/lease 机制以避免并发
 * dispatcher 重复投递；event_payload 保存投递所需的完整事件数据。
 *
 * operationId 与 CreditOperation.operationId 对应（varchar）；
 * creditOperationId 与 CreditOperation.id 对应（uuid）。
 * 两者均为逻辑关联字段，不建立 TypeORM 关系装饰器。
 */
@Entity('credit_operation_outbox')
@Index('IDX_credit_operation_outbox_dispatch', ['status', 'nextAttemptAt'], {
  where: '"status" = \'PENDING\'',
})
@Index('IDX_credit_operation_outbox_operation_id', ['operationId'])
export class CreditOperationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 业务 operation ID，对应 CreditOperation.operationId。 */
  @Column({ type: 'varchar', name: 'operation_id' })
  operationId: string

  /** CreditOperation 主键，对应 CreditOperation.id。 */
  @Column({ type: 'uuid', name: 'credit_operation_id' })
  creditOperationId: string

  /** 投递状态。 */
  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: OutboxStatus

  /** 已尝试次数。 */
  @Column({ type: 'int', default: 0 })
  attempts: number

  /** 下次允许尝试时间（用于退避）。 */
  @Column({ type: 'timestamptz', name: 'next_attempt_at', nullable: true })
  nextAttemptAt: Date | null

  /** 最近一次失败原因。 */
  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null

  /** 当前持有租约的 dispatcher 实例 ID。 */
  @Column({ type: 'uuid', name: 'lease_owner', nullable: true })
  leaseOwner: string | null

  /** 租约到期时间。 */
  @Column({ type: 'timestamptz', name: 'lease_expires_at', nullable: true })
  leaseExpiresAt: Date | null

  /** 投递事件载荷。 */
  @Column({ type: 'jsonb', name: 'event_payload' })
  eventPayload: Record<string, unknown>

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date
}
