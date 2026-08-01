import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { User } from './user.entity'
import { Package } from './package.entity'

/** 用户套餐状态 */
export enum UserPackageStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  REFUNDED = 'REFUNDED',
}

/**
 * 用户套餐实体
 * 用户购买的套餐实例，记录剩余积分与有效期（main 库）
 *
 * order_id 唯一约束（partial unique index）防止同一订单重复绑定到多个 user_package，
 * 保证 paid-grant 幂等性：同一订单支付回调即使被并发处理也只能创建一个 UserPackage。
 */
@Entity('user_packages')
@Index(['userId', 'status'])
@Index('UQ_user_packages_order_id', ['orderId'], {
  unique: true,
  where: '"order_id" IS NOT NULL',
})
export class UserPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 用户 ID */
  @Column({ type: 'uuid' })
  userId: string

  /** 套餐 ID */
  @Column({ type: 'uuid' })
  packageId: string

  /** 关联订单 ID */
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null

  /** 总积分 */
  @Column({ type: 'int', default: 0 })
  pointsTotal: number

  /** 已使用积分 */
  @Column({ type: 'int', default: 0 })
  pointsUsed: number

  /** 剩余积分 */
  @Column({ type: 'int', default: 0 })
  pointsRemaining: number

  /** 状态 */
  @Column({
    type: 'enum',
    enum: UserPackageStatus,
    default: UserPackageStatus.ACTIVE,
  })
  status: UserPackageStatus

  /** 生效时间 */
  @Column({ type: 'timestamptz' })
  startedAt: Date

  /** 过期时间 */
  @Column({ type: 'timestamptz' })
  expiredAt: Date

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  // ---------------- 关联关系 ----------------

  /** 用户（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.userPackages)
  @JoinColumn({ name: 'user_id' })
  user: User

  /** 套餐（main 库内多对一） */
  @ManyToOne(() => Package, (pkg) => pkg.userPackages)
  @JoinColumn({ name: 'package_id' })
  package: Package
}
