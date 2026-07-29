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
import { AvatarGroup } from './avatar-group.entity';

/** 资产类型 */
export enum AssetType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
}

/** 资产状态 */
export enum AssetStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

/**
 * 资产实体
 * 用户上传的原始素材或 AI 生成的成品
 */
@Entity('assets')
@Index(['userId', 'type'])
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所有者用户 ID */
  @Column({ type: 'uuid' })
  userId: string;

  /** 资产类型 */
  @Column({ type: 'enum', enum: AssetType })
  type: AssetType;

  /** 文件名 */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** 对象存储 Key */
  @Column({ type: 'varchar', length: 512 })
  ossKey: string;

  /** 对象存储访问 URL */
  @Column({ type: 'varchar', length: 1024, nullable: true })
  ossUrl: string | null;

  /** MIME 类型 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  mimeType: string | null;

  /** 文件大小（字节） */
  @Column({ type: 'bigint', default: 0 })
  size: number;

  /** 音视频时长（秒） */
  @Column({ type: 'int', nullable: true })
  duration: number | null;

  /** 缩略图 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailKey: string | null;

  /** 所属真人形象组 ID（可空） */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  avatarGroupId: string | null;

  /** 资产状态 */
  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.ACTIVE })
  status: AssetStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---------------- 关联关系 ----------------

  /** 所有者（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.assets)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 所属真人形象组（main 库内多对一，可空） */
  @ManyToOne(() => AvatarGroup, (group) => group.assets, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'avatar_group_id' })
  avatarGroup: AvatarGroup | null;
}
