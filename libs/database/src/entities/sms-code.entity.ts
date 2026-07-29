import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 验证码用途 */
export enum SmsCodePurpose {
  BIND_MOBILE = 'BIND_MOBILE',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

/**
 * 短信验证码实体
 * 手机号绑定/修改密码的验证码（main 库）
 */
@Entity('sms_codes')
@Index(['mobile', 'purpose', 'createdAt'])
export class SmsCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 手机号 */
  @Column({ type: 'varchar', length: 16 })
  mobile: string;

  /** 验证码 */
  @Column({ type: 'varchar', length: 8 })
  code: string;

  /** 用途 */
  @Column({ type: 'enum', enum: SmsCodePurpose })
  purpose: SmsCodePurpose;

  /** 过期时间 */
  @Column({ type: 'timestamptz' })
  expiredAt: Date;

  /** 使用时间（可空，未使用则为 null） */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
