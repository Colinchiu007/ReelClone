import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Work } from './work.entity';

/** AI 模型提供方 */
export enum GenerationProvider {
  SEEDANCE = 'SEEDANCE',
  MOCK = 'MOCK',
}

/** 生成任务状态 */
export enum GenerationTaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * 生成任务实体
 * 一次具体的 AI 模型调用任务，与作品 1:N 关联（支持重试）
 */
@Entity('generation_tasks')
@Index(['status', 'provider'])
export class GenerationTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属作品 ID */
  @Index()
  @Column({ type: 'uuid' })
  workId: string;

  /** 模型方任务 ID */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  providerTaskId: string | null;

  /** AI 模型提供方 */
  @Column({ type: 'enum', enum: GenerationProvider })
  provider: GenerationProvider;

  /** 任务状态 */
  @Column({
    type: 'enum',
    enum: GenerationTaskStatus,
    default: GenerationTaskStatus.PENDING,
  })
  status: GenerationTaskStatus;

  /** 尝试次数 */
  @Column({ type: 'int', default: 0 })
  attempts: number;

  /** 开始执行时间 */
  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  /** 完成时间 */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** 失败原因 */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ---------------- 关联关系 ----------------

  /** 所属作品（main 库内多对一） */
  @ManyToOne(() => Work, (work) => work.generationTasks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'work_id' })
  work: Work;
}
