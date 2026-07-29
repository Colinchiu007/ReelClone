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

/** 通知类型 */
export enum NotificationType {
  TASK_COMPLETED = 'TASK_COMPLETED',
  TASK_FAILED = 'TASK_FAILED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  SYSTEM = 'SYSTEM',
}

/**
 * 通知实体
 * 站内通知，推送给用户的消息（main 库）
 */
@Entity('notifications')
@Index(['userId', 'isRead'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 接收用户 ID */
  @Column({ type: 'uuid' })
  userId: string;

  /** 通知类型 */
  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  /** 标题 */
  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** 内容 */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  /** 附加数据（JSON） */
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, unknown> | null;

  /** 是否已读 */
  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  /** 已读时间 */
  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ---------------- 关联关系 ----------------

  /** 接收用户（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.notifications)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
