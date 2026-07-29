import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Favorite } from './favorite.entity';

/** 模板状态 */
export enum TemplateStatus {
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
}

/**
 * 模板实体
 * 灵感广场/推荐中的模板资源（独立 template 库）
 */
@Entity('templates')
@Index(['category', 'industry'])
@Index(['hotScore'])
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 标题 */
  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** 详细描述 */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 封面图 OSS Key */
  @Column({ type: 'varchar', length: 512 })
  coverKey: string;

  /** 预览视频 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  videoKey: string | null;

  /** 提示词 */
  @Column({ type: 'text', nullable: true })
  prompt: string | null;

  /** 模型配置（JSON） */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  modelConfig: Record<string, unknown>;

  /** 分类 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  category: string | null;

  /** 适用行业 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  industry: string | null;

  /** 适用平台 */
  @Column({ type: 'varchar', length: 32, nullable: true })
  platform: string | null;

  /** 标签（JSON 数组） */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags: string[];

  /** 使用次数 */
  @Column({ type: 'bigint', default: 0 })
  useCount: number;

  /** 收藏次数 */
  @Column({ type: 'bigint', default: 0 })
  favoriteCount: number;

  /** 热度排序值 */
  @Column({ type: 'int', default: 0 })
  hotScore: number;

  /** 模板状态 */
  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.ACTIVE,
  })
  status: TemplateStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ---------------- 关联关系 ----------------

  /** 用户收藏（template 库内一对多） */
  @OneToMany(() => Favorite, (favorite) => favorite.template)
  favorites: Favorite[];
}
