import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/** 对标视频平台 */
export enum BenchmarkPlatform {
  DOUYIN = 'DOUYIN',
  XIAOHONGSHU = 'XIAOHONGSHU',
  BILIBILI = 'BILIBILI',
  KUAISHOU = 'KUAISHOU',
  WEIBO = 'WEIBO',
  WECHAT_VIDEO = 'WECHAT_VIDEO',
}

/** 对标解析状态 */
export enum BenchmarkStatus {
  PENDING = 'PENDING',
  DOWNLOADING = 'DOWNLOADING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * 对标解析实体
 * 用户提交的竞品视频解析记录（独立 benchmark 库）
 */
@Entity('benchmarks')
@Index(['userId', 'createdAt'])
export class Benchmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 提交者用户 ID（跨库 main，仅存 ID） */
  @Column({ type: 'uuid' })
  userId: string;

  /** 原始视频链接 */
  @Column({ type: 'varchar', length: 1024 })
  sourceUrl: string;

  /** 竞品平台 */
  @Column({ type: 'enum', enum: BenchmarkPlatform })
  platform: BenchmarkPlatform;

  /** 解析状态 */
  @Column({
    type: 'enum',
    enum: BenchmarkStatus,
    default: BenchmarkStatus.PENDING,
  })
  status: BenchmarkStatus;

  /** 下载后的 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  videoKey: string | null;

  /** 消耗积分（默认 300） */
  @Column({ type: 'int', default: 0 })
  consumedPoints: number;

  /** 综合分析结果（LLM 汇总） */
  @Column({ type: 'jsonb', nullable: true })
  analysisResult: Record<string, unknown> | null;

  /** 镜头拆解 */
  @Column({ type: 'jsonb', nullable: true })
  shots: Record<string, unknown> | null;

  /** 语音转写 */
  @Column({ type: 'jsonb', nullable: true })
  transcript: Record<string, unknown> | null;

  /** OCR 文本 */
  @Column({ type: 'jsonb', nullable: true })
  ocrResult: Record<string, unknown> | null;

  /** 视觉描述 */
  @Column({ type: 'jsonb', nullable: true })
  visualDescription: Record<string, unknown> | null;

  /** 错误信息 */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** 完成时间 */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---------------- 关联关系 ----------------

  /** 提交者（跨库 main，仅逻辑关联，不建外键） */
  @ManyToOne(() => User, (user) => user.benchmarks, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
