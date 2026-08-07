import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

/** 分账记录状态 */
export enum ProfitSharingStatus {
  /** 待分账（订单已支付，尚未发起） */
  PENDING = 'PENDING',
  /** 分账中（已调用微信 API，等待回调） */
  PROCESSING = 'PROCESSING',
  /** 分账成功 */
  SUCCESS = 'SUCCESS',
  /** 分账失败（可重试） */
  FAILED = 'FAILED',
  /** 分账超限（超过最大重试次数） */
  EXHAUSTED = 'EXHAUSTED',
}

/**
 * 分账记录实体
 *
 * 一条记录对应一次支付成功后发起的分账请求。
 * 包含一个或多个 ProfitSharingItem（每个接收方一条明细）。
 */
@Entity('profit_sharing_records')
@Index(['orderId'], { unique: true })
@Index(['status'])
@Index(['createdAt'])
export class ProfitSharingRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 关联订单 ID（main 库 orders.id） */
  @Column({ type: 'uuid' })
  orderId: string

  /** 订单号（冗余，便于查询） */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  orderNo: string

  /** 订单总金额（分） */
  @Column({ type: 'int' })
  totalAmount: number

  /** 分账总金额（分，所有接收方之和） */
  @Column({ type: 'int' })
  sharedAmount: number

  /** 分账状态 */
  @Column({ type: 'enum', enum: ProfitSharingStatus, default: ProfitSharingStatus.PENDING })
  status: ProfitSharingStatus

  /** 微信分账单号（微信侧的分账请求号） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  profitSharingNo: string | null

  /** 已重试次数 */
  @Column({ type: 'int', default: 0 })
  retryCount: number

  /** 最大重试次数 */
  @Column({ type: 'int', default: 3 })
  maxRetryCount: number

  /** 失败原因 */
  @Column({ type: 'text', nullable: true })
  failureReason: string | null

  /** 分账发起时间 */
  @Column({ type: 'timestamptz', nullable: true })
  sharedAt: Date | null

  /** 最后一次回调时间 */
  @Column({ type: 'timestamptz', nullable: true })
  callbackAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
