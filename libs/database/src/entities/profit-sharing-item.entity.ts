import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

/**
 * 分账明细实体
 *
 * 每条明细对应一个接收方的分账金额。
 * 由 ProfitSharingService 在发起分账前批量创建。
 */
@Entity('profit_sharing_items')
@Index(['recordId'])
@Index(['receiverId'])
export class ProfitSharingItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 关联分账记录 ID */
  @Column({ type: 'uuid' })
  recordId: string

  /** 关联接收方 ID */
  @Column({ type: 'uuid' })
  receiverId: string

  /** 接收方名称（冗余，便于查询展示） */
  @Column({ type: 'varchar', length: 64 })
  receiverName: string

  /** 分账比例快照（万分之一，发起分账时冻结） */
  @Column({ type: 'int' })
  ratio: number

  /** 分账金额（分） */
  @Column({ type: 'int' })
  amount: number

  /** 微信分账接收方类型 */
  @Column({ type: 'varchar', length: 32 })
  receiverType: string

  /** 微信分账接收方 ID */
  @Column({ type: 'varchar', length: 128 })
  receiverAccountId: string

  /** 该明细的分账结果（SUCCESS / FAILED / PENDING） */
  @Column({ type: 'varchar', length: 32, default: 'PENDING' })
  status: string

  /** 微信返回的单条分账结果描述 */
  @Column({ type: 'text', nullable: true })
  failReason: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
