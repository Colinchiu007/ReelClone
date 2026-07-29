import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

/**
 * 审计日志实体
 *
 * 记录管理后台所有敏感操作（退款、封禁、调账、审核、Key 更新等），
 * 满足合规审计与事后追溯需求。存储于 main 库。
 *
 * 写入由 AuditLogService.record() 完成，查询由 AdminAuditController 暴露。
 */
@Entity('audit_log')
@Index('idx_audit_log_operator', ['operatorId'])
@Index('idx_audit_log_action', ['action'])
@Index('idx_audit_log_target', ['targetType', 'targetId'])
@Index('idx_audit_log_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** 操作者用户 ID */
  @Column({ type: 'varchar', length: 64 })
  operatorId: string

  /** 操作者角色（USER / ADMIN / SUPER_ADMIN） */
  @Column({ type: 'varchar', length: 32 })
  operatorRole: string

  /** 操作类型（如 ORDER_REFUND / USER_BAN / POINTS_GRANT / API_KEY_UPDATE / TEMPLATE_REVIEW） */
  @Column({ type: 'varchar', length: 64 })
  action: string

  /** 目标对象类型（ORDER / USER / TEMPLATE / AVATAR_GROUP / SYSTEM_CONFIG 等） */
  @Column({ type: 'varchar', length: 64 })
  targetType: string

  /** 目标对象 ID */
  @Column({ type: 'varchar', length: 64 })
  targetId: string

  /** 操作详情（JSON，存储请求参数、结果摘要等） */
  @Column({ type: 'jsonb', nullable: true })
  detail: Record<string, unknown> | null

  /** 操作结果（SUCCESS / FAILURE / PARTIAL） */
  @Column({ type: 'varchar', length: 16, default: 'SUCCESS' })
  result: string

  /** 操作 IP（可空，来自请求头 x-forwarded-for 或 remoteAddress） */
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null

  /** User-Agent（可空） */
  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date
}
