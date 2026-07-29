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
import { Package } from './package.entity';

/** 订单状态 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/** 支付方式 */
export enum PaymentMethod {
  WECHAT = 'WECHAT',
}

/**
 * 订单实体
 * 用户购买套餐的订单（main 库）
 */
@Entity('orders')
@Index(['userId', 'status'])
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 购买者用户 ID */
  @Column({ type: 'uuid' })
  userId: string;

  /** 套餐 ID */
  @Column({ type: 'uuid' })
  packageId: string;

  /** 订单号（唯一） */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  orderNo: string;

  /** 订单金额（元） */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  /** 订单状态 */
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  /** 支付方式 */
  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  /** 支付时间 */
  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** 取消时间 */
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  /** 微信支付流水号 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  transactionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---------------- 关联关系 ----------------

  /** 购买者（main 库内多对一） */
  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** 套餐（main 库内多对一） */
  @ManyToOne(() => Package, (pkg) => pkg.orders)
  @JoinColumn({ name: 'package_id' })
  package: Package;
}
