import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

// 跨库实体仅用于类型参考，不在此文件中建立 TypeORM 关系装饰器
// import { User } from './user.entity';

/** 积分交易类型 */
export enum PointTransactionType {
  FREEZE = 'FREEZE',
  SETTLE = 'SETTLE',
  RELEASE = 'RELEASE',
  GRANT = 'GRANT',
  CONSUME = 'CONSUME',
  /** 模板被使用奖励上传者 */
  REWARD = 'REWARD',
}

/**
 * 积分流水实体
 * 积分变动流水，与 Formance Ledger 对账（独立 billing 库）
 * amount: 正数=增加，负数=扣减
 */
@Entity('point_transactions')
@Index(['userId', 'createdAt'])
@Index(['freezeId', 'type'])
@Index(['reservationId', 'type'])
export class PointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 用户 ID（跨库 main，仅存 ID） */
  @Column({ type: 'uuid' })
  userId: string

  /** 交易类型 */
  @Column({ type: 'enum', enum: PointTransactionType })
  type: PointTransactionType

  /** 变动数量（正数=增加，负数=扣减） */
  @Column({ type: 'int' })
  amount: number

  /** 变更后余额 */
  @Column({ type: 'int' })
  balance: number

  /** 关联作品 ID（跨库 main，可空） */
  @Column({ type: 'uuid', nullable: true })
  workId: string | null

  /** 关联订单 ID（跨库 main，可空） */
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null

  /** 关联模板 ID（跨库 template，REWARD 类型时填充） */
  @Column({ type: 'varchar', length: 36, nullable: true })
  templateId: string | null

  /** SETTLE / RELEASE 对应的原始 FREEZE 流水 ID */
  @Column({ type: 'uuid', nullable: true })
  freezeId: string | null

  /** V2 生成预留 ID（main 库逻辑关联；历史流水保持 NULL）。 */
  @Column({ type: 'uuid', nullable: true })
  reservationId: string | null

  /** 幂等键（唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string

  /** 说明 */
  @Column({ type: 'varchar', length: 255 })
  description: string

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  // -------------------- 跨库逻辑关联（仅保留 ID 字段，不用 TypeORM 关系装饰器） --------------------
  // user: 跨 main 库，通过 user_id 逻辑关联
}
