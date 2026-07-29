/**
 * AuditLogService — 审计日志服务
 *
 * 职责：
 * - record(): 异步写入审计日志（不阻塞主流程，失败仅记录 warn 日志）
 * - list(): 分页查询审计日志（供 admin-audit 模块调用）
 *
 * 设计原则：
 * - 写入是 best-effort：审计日志写入失败不应阻塞业务操作
 * - 异步执行：使用 Promise 包裹但不 await（fire-and-forget），避免影响主流程性能
 * - 最小依赖：仅依赖 TypeORM Repository<AuditLog>
 *
 * 用法：
 *   constructor(private readonly auditLog: AuditLogService) {}
 *
 *   // fire-and-forget（推荐）
 *   this.auditLog.record({
 *     operatorId, operatorRole: 'ADMIN',
 *     action: 'ORDER_REFUND', targetType: 'ORDER', targetId: orderId,
 *     detail: { reason, pointsDeducted, wechatRefundInitiated },
 *     result: 'SUCCESS',
 *   })
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuditLog, DATABASE_CONNECTIONS } from '@reelclone/database'

/** 审计日志写入参数 */
export interface AuditLogInput {
  /** 操作者用户 ID */
  operatorId: string
  /** 操作者角色（USER / ADMIN / SUPER_ADMIN） */
  operatorRole: string
  /** 操作类型（如 ORDER_REFUND / USER_BAN / POINTS_GRANT / API_KEY_UPDATE） */
  action: string
  /** 目标对象类型（ORDER / USER / TEMPLATE 等） */
  targetType: string
  /** 目标对象 ID */
  targetId: string
  /** 操作详情（JSON） */
  detail?: Record<string, unknown>
  /** 操作结果（SUCCESS / FAILURE / PARTIAL），默认 SUCCESS */
  result?: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
  /** 操作 IP */
  ip?: string | null
  /** User-Agent */
  userAgent?: string | null
}

/** 审计日志查询结果 */
export interface PaginatedAuditLog {
  list: AuditLog[]
  page: number
  pageSize: number
  total: number
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name)

  constructor(
    @InjectRepository(AuditLog, DATABASE_CONNECTIONS.MAIN)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * 写入审计日志（fire-and-forget，不阻塞主流程）
   *
   * 写入失败仅记录 warn 日志，不抛出异常。
   * 返回的 Promise 可被忽略（fire-and-forget），也可 await 以确保写入成功。
   */
  async record(input: AuditLogInput): Promise<void> {
    try {
      await this.repo.save({
        operatorId: input.operatorId,
        operatorRole: input.operatorRole,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        detail: input.detail ?? null,
        result: input.result ?? 'SUCCESS',
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
    } catch (err) {
      // 审计日志写入失败不阻塞业务，仅记录 warn
      this.logger.warn(
        `审计日志写入失败 action=${input.action} targetId=${input.targetId}: ${(err as Error).message}`,
      )
    }
  }

  /**
   * 分页查询审计日志
   *
   * @param query 查询条件（operatorId / action / targetType / targetId / 时间范围 / 分页）
   */
  async list(query: {
    operatorId?: string
    action?: string
    targetType?: string
    targetId?: string
    startDate?: string
    endDate?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedAuditLog> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.repo
      .createQueryBuilder('a')
      .select([
        'a.id',
        'a.operatorId',
        'a.operatorRole',
        'a.action',
        'a.targetType',
        'a.targetId',
        'a.detail',
        'a.result',
        'a.ip',
        'a.createdAt',
      ])
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (query.operatorId) {
      qb.andWhere('a.operatorId = :operatorId', { operatorId: query.operatorId })
    }
    if (query.action) {
      qb.andWhere('a.action = :action', { action: query.action })
    }
    if (query.targetType) {
      qb.andWhere('a.targetType = :targetType', { targetType: query.targetType })
    }
    if (query.targetId) {
      qb.andWhere('a.targetId = :targetId', { targetId: query.targetId })
    }
    if (query.startDate) {
      qb.andWhere('a.createdAt >= :startDate', { startDate: new Date(query.startDate) })
    }
    if (query.endDate) {
      qb.andWhere('a.createdAt <= :endDate', { endDate: new Date(query.endDate) })
    }

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }
}
