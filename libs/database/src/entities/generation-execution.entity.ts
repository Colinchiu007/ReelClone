import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/**
 * 生成 saga 的 durable execution 状态机阶段。
 *
 * 状态转换规则（reconciler 与 saga 共同遵守）：
 * - INITIATED → OUTPUT_READY | FAILED | WORKFLOW_START_UNKNOWN | CANCELED
 * - OUTPUT_READY → SETTLEMENT_PENDING | FAILED
 * - SETTLEMENT_PENDING → SETTLED | FAILED（仅当 provider 明确失败）
 * - SETTLED → COMPLETION_PENDING（只能向 COMPLETED 收敛，绝不能进入 RELEASE 分支）
 * - COMPLETION_PENDING → COMPLETED
 * - PROVIDER_STATE_UNKNOWN → INITIATED | FAILED | CANCELED（由 reconciler 转换）
 * - BILLING_RELEASE_PENDING → FAILED | CANCELED（release 完成后）
 * - 一旦 SETTLED，禁止转为 FAILED / CANCELED / BILLING_RELEASE_PENDING
 */
export enum GenerationExecutionStage {
  INITIATED = 'INITIATED',
  OUTPUT_READY = 'OUTPUT_READY',
  SETTLEMENT_PENDING = 'SETTLEMENT_PENDING',
  SETTLED = 'SETTLED',
  COMPLETION_PENDING = 'COMPLETION_PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  PROVIDER_STATE_UNKNOWN = 'PROVIDER_STATE_UNKNOWN',
  PROVIDER_CANCEL_PENDING = 'PROVIDER_CANCEL_PENDING',
  WORKFLOW_START_UNKNOWN = 'WORKFLOW_START_UNKNOWN',
  BILLING_RELEASE_PENDING = 'BILLING_RELEASE_PENDING',
}

/**
 * 生成 saga 的 durable execution 权威记录（main 库）。
 *
 * 作为生成流程 durable reconciler 的基础，承载一次生成 saga 从发起到
 * 完成的全部状态机演进。与 Work / GenerationTask / CreditOperation /
 * CreditReservation 位于同一 main 库，但只保留 ID 字段，不建立 TypeORM
 * 关系装饰器，避免跨库边界被误建为关系。
 *
 * request_fingerprint 用于防止相同生成参数重复提交；workflow_id 为
 * Temporal workflow 的确定性标识（video-gen-{workId}-{executionId}）。
 * reconciler 通过 stage + recovery_deadline 索引扫描需要恢复的 execution。
 */
@Entity('generation_executions')
@Index('UQ_generation_executions_work_task', ['workId', 'taskId'], {
  unique: true,
  where: '"task_id" IS NOT NULL',
})
@Index('UQ_generation_executions_request_fingerprint', ['requestFingerprint'], {
  unique: true,
})
@Index('UQ_generation_executions_workflow_id', ['workflowId'], { unique: true })
@Index('IDX_generation_executions_reconciler', ['stage', 'recoveryDeadline'], {
  where:
    "\"stage\" IN ('PROVIDER_STATE_UNKNOWN', 'PROVIDER_CANCEL_PENDING', 'WORKFLOW_START_UNKNOWN', 'BILLING_RELEASE_PENDING')",
})
@Index('IDX_generation_executions_work_id', ['workId'])
export class GenerationExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 关联作品 ID（main 库逻辑关联）。 */
  @Column({ type: 'uuid', name: 'work_id' })
  workId: string

  /** 关联生成任务 ID（main 库逻辑关联，可能延迟创建，可空）。 */
  @Column({ type: 'uuid', name: 'task_id', nullable: true })
  taskId: string | null

  /** 请求指纹（生成参数 hash），用于防重复提交。 */
  @Column({ type: 'varchar', name: 'request_fingerprint' })
  requestFingerprint: string

  /** Provider 返回的任务 ID，可空（尚未收到 provider 确认时）。 */
  @Column({ type: 'varchar', name: 'provider_token', nullable: true })
  providerToken: string | null

  /** Temporal workflow ID（确定性：video-gen-{workId}-{executionId}）。 */
  @Column({ type: 'varchar', name: 'workflow_id' })
  workflowId: string

  /** 关联 CreditOperation.id（main 库逻辑关联）。 */
  @Column({ type: 'uuid', name: 'billing_operation_id' })
  billingOperationId: string

  /** 关联 CreditReservation.id（main 库逻辑关联）。 */
  @Column({ type: 'uuid', name: 'reservation_id' })
  reservationId: string

  /** 状态机阶段。 */
  @Column({ type: 'varchar', length: 30 })
  stage: GenerationExecutionStage

  /** 重试次数。 */
  @Column({ type: 'int', default: 0 })
  attempt: number

  /** 超过此时间触发人工 case，可空。 */
  @Column({ type: 'timestamptz', name: 'recovery_deadline', nullable: true })
  recoveryDeadline: Date | null

  /** reconciler claim owner ID，可空。 */
  @Column({ type: 'uuid', name: 'reconciler_owner', nullable: true })
  reconcilerOwner: string | null

  /** 最近一次 reconciler 处理时间，可空。 */
  @Column({ type: 'timestamptz', name: 'last_reconciled_at', nullable: true })
  lastReconciledAt: Date | null

  /** 附加元数据，可空。 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date
}
