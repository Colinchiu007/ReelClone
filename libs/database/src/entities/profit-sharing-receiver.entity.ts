import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

/** 分账接收方类型 */
export enum ReceiverType {
  /** 创作者（个人） */
  USER = 'USER',
  /** 推广渠道 */
  CHANNEL = 'CHANNEL',
}

/** 分账接收方状态 */
export enum ReceiverStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * 分账接收方实体
 *
 * 管理员在后台配置，支付成功后按比例自动分账给各接收方。
 * ratio 精度为万分之一（1 = 0.01%），所有活跃接收方 ratio 之和不得超过 10000（100%）。
 */
@Entity('profit_sharing_receivers')
@Index(['status'])
export class ProfitSharingReceiver {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 接收方名称（展示用） */
  @Column({ type: 'varchar', length: 64 })
  name: string

  /** 接收方类型 */
  @Column({ type: 'enum', enum: ReceiverType })
  type: ReceiverType

  /** 分账比例（万分之一精度，7000 = 70%，最大 10000） */
  @Column({ type: 'int' })
  ratio: number

  /** 微信分账接收方类型（OPENID / MERCHANT_ID） */
  @Column({ type: 'varchar', length: 32 })
  receiverType: string

  /** 微信分账接收方 ID（openid 或 merchant_id） */
  @Column({ type: 'varchar', length: 128 })
  receiverAccountId: string

  /** 接收方状态 */
  @Column({ type: 'enum', enum: ReceiverStatus, default: ReceiverStatus.ACTIVE })
  status: ReceiverStatus

  /** 备注 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  remark: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
