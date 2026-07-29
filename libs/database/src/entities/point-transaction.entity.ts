import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/** 积分交易类型 */
export enum PointTransactionType {
  FREEZE = 'FREEZE',
  SETTLE = 'SETTLE',
  RELEASE = 'RELEASE',
  GRANT = 'GRANT',
  CONSUME = 'CONSUME',
}

/**
 * 积分流水实体
 * 积分变动流水，与 Formance Ledger 对账（独立 billing 库）
 * amount: 正数=增加，负数=扣减
 */
@Entity('point_transactions')
@Index(['userId', 'createdAt'])
export class PointTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 用户 ID（跨库 main，仅存 ID） */
  @Column({ type: 'uuid' })
  userId: string;

  /** 交易类型 */
  @Column({ type: 'enum', enum: PointTransactionType })
  type: PointTransactionType;

  /** 变动数量（正数=增加，负数=扣减） */
  @Column({ type: 'int' })
  amount: number;

  /** 变更后余额 */
  @Column({ type: 'int' })
  balance: number;

  /** 关联作品 ID（跨库 main，可空） */
  @Column({ type: 'uuid', nullable: true })
  workId: string | null;

  /** 关联订单 ID（跨库 main，可空） */
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  /** 幂等键（唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  idempotencyKey: string;

  /** 说明 */
  @Column({ type: 'varchar', length: 255 })
  description: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ---------------- 关联关系 ----------------

  /** 用户（跨库 main，仅逻辑关联，不建外键） */
  @ManyToOne(() => User, (user) => user.pointTransactions, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
