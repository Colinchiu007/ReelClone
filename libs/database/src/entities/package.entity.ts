import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserPackage } from './user-package.entity';
import { Order } from './order.entity';

/** 套餐类型 */
export enum PackageType {
  SUBSCRIPTION = 'SUBSCRIPTION',
  ONE_TIME = 'ONE_TIME',
}

/** 套餐状态 */
export enum PackageStatus {
  ACTIVE = 'ACTIVE',
  OFFLINE = 'OFFLINE',
}

/**
 * 套餐实体
 * 系统定义的积分套餐（main 库）
 */
@Entity('packages')
@Index(['sort'])
export class Package {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 套餐名称 */
  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** 描述 */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 价格（元） */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  /** 原价（元） */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalPrice: number | null;

  /** 包含积分数量 */
  @Column({ type: 'int', default: 0 })
  points: number;

  /** 赠送积分数量 */
  @Column({ type: 'int', default: 0 })
  bonusPoints: number;

  /** 有效期（天） */
  @Column({ type: 'int', default: 0 })
  duration: number;

  /** 功能特性（JSON 数组） */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  features: string[];

  /** 套餐类型 */
  @Column({ type: 'enum', enum: PackageType })
  type: PackageType;

  /** 套餐状态 */
  @Column({
    type: 'enum',
    enum: PackageStatus,
    default: PackageStatus.ACTIVE,
  })
  status: PackageStatus;

  /** 排序值 */
  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ---------------- 关联关系 ----------------

  /** 用户套餐实例（main 库内一对多） */
  @OneToMany(() => UserPackage, (pkg) => pkg.package)
  userPackages: UserPackage[];

  /** 关联订单（main 库内一对多） */
  @OneToMany(() => Order, (order) => order.package)
  orders: Order[];
}
