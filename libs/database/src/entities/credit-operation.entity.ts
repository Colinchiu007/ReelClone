import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** 计费操作类型。 */
export enum CreditOperationType {
  GRANT = 'GRANT',
  REWARD = 'REWARD',
  CONSUME = 'CONSUME',
  FREEZE = 'FREEZE',
  RELEASE = 'RELEASE',
  SETTLE = 'SETTLE',
  ADMIN_GRANT = 'ADMIN_GRANT',
  ADMIN_ADJUST = 'ADMIN_ADJUST',
}

/** 计费操作生命周期状态。 */
export enum CreditOperationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  DEAD = 'DEAD',
}

/**
 * 计费操作权威记录（main 库）。
 *
 * 作为 V2 计费一致性的基础，承载所有积分变动的 durable operation。
 * 与 User/Order/Work/Template 等位于同一 main 库，但只保留 ID 字段，
 * 不建立 TypeORM 关系装饰器，避免跨库边界被误建为关系。
 *
 * 幂等性由 (user_id, type, idempotency_key, request_fingerprint) 唯一索引
 * 与 operation_id 唯一索引共同保证。status 字段记录生命周期，
 * PENDING → CONFIRMED 或 PENDING → FAILED/DEAD。
 */
@Entity('credit_operations')
@Index(
  'IDX_credit_operations_idempotency',
  ['userId', 'type', 'idempotencyKey', 'requestFingerprint'],
  { unique: true },
)
@Index('UQ_credit_operations_operation_id', ['operationId'], { unique: true })
@Index('IDX_credit_operations_user_id', ['userId'])
@Index('IDX_credit_operations_related_order', ['relatedOrderId'], {
  where: '"related_order_id" IS NOT NULL',
})
@Index('IDX_credit_operations_related_work', ['relatedWorkId'], {
  where: '"related_work_id" IS NOT NULL',
})
export class CreditOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 所属用户 ID（main 库逻辑关联）。 */
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string

  /** 操作类型。 */
  @Column({ type: 'varchar', length: 20 })
  type: CreditOperationType

  /** 变动数量；GRANT/SETTLE 为正，FREEZE/CONSUME 为负。 */
  @Column({ type: 'integer' })
  amount: number

  /** 关联订单/套餐 ID（paid-grant 用），可空。 */
  @Column({ type: 'uuid', name: 'related_order_id', nullable: true })
  relatedOrderId: string | null

  /** 关联模板 ID（模板奖励用），可空。 */
  @Column({ type: 'uuid', name: 'related_template_id', nullable: true })
  relatedTemplateId: string | null

  /** 关联生成任务 ID，可空。 */
  @Column({ type: 'uuid', name: 'related_work_id', nullable: true })
  relatedWorkId: string | null

  /** 请求指纹（payload hash），与 idempotency_key 共同保证幂等。 */
  @Column({ type: 'varchar', name: 'request_fingerprint' })
  requestFingerprint: string

  /** 幂等键。 */
  @Column({ type: 'varchar', name: 'idempotency_key' })
  idempotencyKey: string

  /** 业务 operation ID（如 adjustment UUID），全局唯一。 */
  @Column({ type: 'varchar', name: 'operation_id' })
  operationId: string

  /** 操作生命周期状态。 */
  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: CreditOperationStatus

  /** 附加元数据，可空。 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date
}
