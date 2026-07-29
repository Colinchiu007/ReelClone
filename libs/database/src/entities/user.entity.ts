import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Asset } from './asset.entity';
import { Work } from './work.entity';
import { AvatarGroup } from './avatar-group.entity';
import { Order } from './order.entity';
import { UserPackage } from './user-package.entity';
import { Notification } from './notification.entity';
import { Benchmark } from './benchmark.entity';
import { PointTransaction } from './point-transaction.entity';
import { Favorite } from './favorite.entity';

/** 用户状态 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  DELETED = 'DELETED',
}

/**
 * 用户实体
 * 微信小程序用户，一个 OpenID 对应一个用户
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 微信 OpenID（唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  openId: string;

  /** 微信 UnionID */
  @Column({ type: 'varchar', length: 64, nullable: true })
  unionId: string | null;

  /** 绑定手机号 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16, nullable: true })
  mobile: string | null;

  /** 密码（哈希） */
  @Column({ type: 'varchar', length: 128, nullable: true })
  password: string | null;

  /** 昵称 */
  @Column({ type: 'varchar', length: 64 })
  nickname: string;

  /** 头像 URL */
  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null;

  /** 邮箱 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  email: string | null;

  /** 当前积分（可用余额） */
  @Column({ type: 'int', default: 0 })
  currentPoints: number;

  /** 累计积分 */
  @Column({ type: 'int', default: 0 })
  totalPoints: number;

  /** 行业偏好（JSON 数组） */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  industryPreferences: string[];

  /** 用户状态 */
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /** 最后登录时间 */
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---------------- 关联关系 ----------------

  /** 用户拥有的资产（main 库内一对多） */
  @OneToMany(() => Asset, (asset) => asset.user)
  assets: Asset[];

  /** 用户创作的作品（main 库内一对多） */
  @OneToMany(() => Work, (work) => work.user)
  works: Work[];

  /** 用户的真人形象组（main 库内一对多） */
  @OneToMany(() => AvatarGroup, (group) => group.user)
  avatarGroups: AvatarGroup[];

  /** 用户的订单（main 库内一对多） */
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  /** 用户的套餐（main 库内一对多） */
  @OneToMany(() => UserPackage, (pkg) => pkg.user)
  userPackages: UserPackage[];

  /** 用户的通知（main 库内一对多） */
  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[];

  /** 用户的对标解析（跨库 benchmark，仅逻辑关联，不建外键） */
  @OneToMany(() => Benchmark, (benchmark) => benchmark.user, {
    createForeignKeyConstraints: false,
  })
  benchmarks: Benchmark[];

  /** 用户的积分流水（跨库 billing，仅逻辑关联，不建外键） */
  @OneToMany(() => PointTransaction, (tx) => tx.user, {
    createForeignKeyConstraints: false,
  })
  pointTransactions: PointTransaction[];

  /** 用户的模板收藏（跨库 template，仅逻辑关联，不建外键） */
  @OneToMany(() => Favorite, (favorite) => favorite.user, {
    createForeignKeyConstraints: false,
  })
  favorites: Favorite[];
}
