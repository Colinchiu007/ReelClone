import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm'
import { Asset } from './asset.entity'
import { Work } from './work.entity'
import { AvatarGroup } from './avatar-group.entity'
import { Order } from './order.entity'
import { UserPackage } from './user-package.entity'
import { Notification } from './notification.entity'

// 跨库实体仅用于类型参考，不在此文件中建立 TypeORM 关系装饰器
// import { Benchmark } from './benchmark.entity'
// import { PointTransaction } from './point-transaction.entity'
// import { Favorite } from './favorite.entity'

/** 用户状态 */
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  DELETED = 'DELETED',
}

/** 用户角色 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * 用户实体
 * 微信小程序用户，一个 OpenID 对应一个用户
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 微信 OpenID（唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  openId: string

  /** 微信 UnionID */
  @Column({ type: 'varchar', length: 64, nullable: true })
  unionId: string | null

  /** 绑定手机号 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 16, nullable: true })
  mobile: string | null

  /** 密码（哈希） */
  @Column({ type: 'varchar', length: 128, nullable: true })
  password: string | null

  /** 昵称 */
  @Column({ type: 'varchar', length: 64 })
  nickname: string

  /** 头像 URL */
  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl: string | null

  /** 邮箱 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  email: string | null

  /** 当前积分（可用余额） */
  @Column({ type: 'int', default: 0 })
  currentPoints: number

  /** 累计积分 */
  @Column({ type: 'int', default: 0 })
  totalPoints: number

  /** 行业偏好（JSON 数组） */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  industryPreferences: string[]

  /** 用户状态 */
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus

  /** 用户角色 */
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole

  /** 最后登录时间 */
  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date

  // ---------------- 关联关系 ----------------

  /** 用户拥有的资产（main 库内一对多） */
  @OneToMany(() => Asset, (asset) => asset.user)
  assets: Asset[]

  /** 用户创作的作品（main 库内一对多） */
  @OneToMany(() => Work, (work) => work.user)
  works: Work[]

  /** 用户的真人形象组（main 库内一对多） */
  @OneToMany(() => AvatarGroup, (group) => group.user)
  avatarGroups: AvatarGroup[]

  /** 用户的订单（main 库内一对多） */
  @OneToMany(() => Order, (order) => order.user)
  orders: Order[]

  /** 用户的套餐（main 库内一对多） */
  @OneToMany(() => UserPackage, (pkg) => pkg.user)
  userPackages: UserPackage[]

  /** 用户的通知（main 库内一对多） */
  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Notification[]

  // -------------------- 跨库逻辑关联（仅保留 ID 字段，不用 TypeORM 关系装饰器） --------------------
  // benchmarks: 跨 benchmark 库，通过 benchmark.user_id 逻辑关联
  // pointTransactions: 跨 billing 库，通过 point_transaction.user_id 逻辑关联
  // favorites: 跨 template 库，通过 favorite.user_id 逻辑关联
}
