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
} from 'typeorm';
import { User } from './user.entity';
import { Asset } from './asset.entity';

/** 真人形象授权状态 */
export enum AuthorizationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  EXPIRED = 'EXPIRED',
}

/** 真人形象组状态 */
export enum AvatarGroupStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

/**
 * 真人形象资产组实体
 * 管理真人形象素材的集合，需关联授权信息
 */
@Entity('avatar_groups')
export class AvatarGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所有者用户 ID */
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** 组名称 */
  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** 描述 */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 授权书 OSS Key */
  @Column({ type: 'varchar', length: 512, nullable: true })
  authorizationKey: string | null;

  /** 授权状态 */
  @Column({
    type: 'enum',
    enum: AuthorizationStatus,
    default: AuthorizationStatus.PENDING,
  })
  authorizationStatus: AuthorizationStatus;

  /** 素材数量 */
  @Column({ type: 'int', default: 0 })
  assetCount: number;

  /** 状态 */
  @Column({
    type: 'enum',
    enum: AvatarGroupStatus,
    default: AvatarGroupStatus.ACTIVE,
  })
  status: AvatarGroupStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---------------- 关联关系 ----------------

  /** 所有者（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.avatarGroups)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 组内素材（main 库内一对多） */
  @OneToMany(() => Asset, (asset) => asset.avatarGroup)
  assets: Asset[];
}
