import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm'
import { User } from './user.entity'
import { GenerationTask } from './generation-task.entity'

// 跨库实体仅用于类型参考，不在此文件中建立 TypeORM 关系装饰器
// import { Benchmark } from './benchmark.entity';
// import { Template } from './template.entity';

/** 作品类型 */
export enum WorkType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

/** 作品状态 */
export enum WorkStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  DELETED = 'DELETED',
}

/**
 * 作品实体
 * 用户创作的图片/视频作品，一个作品可能对应多次生成任务（重试/再创作）
 */
@Entity('works')
@Index(['userId', 'status'])
@Index(['userId', 'type'])
@Index(['userId', 'idempotencyKey'], { unique: true })
export class Work {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 创作者用户 ID */
  @Column({ type: 'uuid' })
  userId: string

  /** 作品类型 */
  @Column({ type: 'enum', enum: WorkType })
  type: WorkType

  /** 标题 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null

  /** 提示词 */
  @Column({ type: 'text', nullable: true })
  prompt: string | null

  /** 负向提示词 */
  @Column({ type: 'text', nullable: true })
  negativePrompt: string | null

  /** 模型配置（JSON） */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  modelConfig: Record<string, unknown>

  /** 创建生成任务时使用的请求幂等键（同一用户内唯一） */
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null

  /** 结果文件 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  resultKey: string | null

  /** 结果文件访问 URL */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  resultUrl: string | null

  /** 缩略图 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailKey: string | null

  /** 作品状态 */
  @Column({ type: 'enum', enum: WorkStatus, default: WorkStatus.PENDING })
  status: WorkStatus

  /** 消耗积分 */
  @Column({ type: 'int', default: 0 })
  cost: number

  /** 错误日志（JSON） */
  @Column({ type: 'jsonb', nullable: true })
  errorLog: Record<string, unknown> | null

  /** 来源对标解析 ID（跨库 benchmark，可空） */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  benchmarkId: string | null

  /** 来源模板 ID（跨库 template，可空） */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  templateId: string | null

  /** 内容审核结果（JSON） */
  @Column({ type: 'jsonb', nullable: true })
  moderationResult: Record<string, unknown> | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // ---------------- 关联关系 ----------------

  /** 创作者（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.works)
  @JoinColumn({ name: 'user_id' })
  user: User

  /** 生成任务（main 库内一对多） */
  @OneToMany(() => GenerationTask, (task) => task.work)
  generationTasks: GenerationTask[]

  // -------------------- 跨库逻辑关联（仅保留 ID 字段，不用 TypeORM 关系装饰器） --------------------
  // benchmark: 跨 benchmark 库，通过 benchmark_id 逻辑关联
  // template: 跨 template 库，通过 template_id 逻辑关联
}
