import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm'

/** 生成积分预留的权威状态（存储于 main 库）。 */
export enum CreditReservationStatus {
  OPEN = 'OPEN',
  SETTLED = 'SETTLED',
  RELEASED = 'RELEASED',
}

/**
 * 生成积分预留。
 *
 * 与 User 和 Work 位于同一 main 库，但只保存 ID，避免把账务投影的跨库边界
 * 误建为 TypeORM 关系。OPEN 到任一终态的状态转换及相应 outbox 写入必须在
 * main 库的同一事务中完成。
 */
@Entity('credit_reservations')
@Index('IDX_credit_reservations_user_status', ['userId', 'status'])
@Index('IDX_credit_reservations_work_status', ['workId', 'status'])
@Index('UQ_credit_reservations_open_work', ['workId'], {
  unique: true,
  where: '"status" = \'OPEN\'',
})
@Index('UQ_credit_reservations_freeze_operation_key', ['freezeOperationKey'], { unique: true })
@Index('UQ_credit_reservations_terminal_operation_key', ['terminalOperationKey'], {
  unique: true,
})
@Index('UQ_credit_reservations_terminal_transaction_id', ['terminalTransactionId'], {
  unique: true,
  where: '"terminal_transaction_id" IS NOT NULL',
})
export class CreditReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 所属用户 ID（main 库逻辑关联）。 */
  @Column({ type: 'uuid' })
  userId: string

  /** 所属作品 ID（main 库逻辑关联）。 */
  @Column({ type: 'uuid' })
  workId: string

  /** 本次全额预留的积分数量，始终为正数。 */
  @Column({ type: 'int' })
  amount: number

  /** OPEN 只能转换为 SETTLED 或 RELEASED 之一。 */
  @Column({
    type: 'enum',
    enum: CreditReservationStatus,
    default: CreditReservationStatus.OPEN,
  })
  status: CreditReservationStatus

  /** 冻结投影的稳定操作键。 */
  @Column({ type: 'varchar', length: 128 })
  freezeOperationKey: string

  /** 实际执行的结算或释放投影键；OPEN 时为空，终态后不可再变更。 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  terminalOperationKey: string | null

  /** billing 库终态流水 ID；outbox 投影成功前允许为空。 */
  @Column({ type: 'uuid', nullable: true })
  terminalTransactionId: string | null

  /** 冻结后 main 库可用余额快照。 */
  @Column({ type: 'int' })
  balanceAfterFreeze: number

  /** 终态化后的 main 库可用余额快照；SETTLED 时通常与冻结后相同。 */
  @Column({ type: 'int', nullable: true })
  balanceAfterTerminal: number | null

  /** 预留终态化时间。 */
  @Column({ type: 'timestamptz', nullable: true })
  terminalAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
