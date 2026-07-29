/**
 * AdminReconcileService — 对账监控服务
 *
 * 职责：
 *  1. getResults：查看对账结果（从 Redis 读取 `reconcile:results:{date}` 缓存）
 *  2. triggerReconcile：手动触发对账（HTTP 调用 billing-service /api/v1/billing/reconcile）
 *
 * 缓存策略：
 *  - key:   `reconcile:results:{date}`
 *  - TTL:   7 天（604800 秒）
 *  - value: JSON 序列化的不一致记录列表
 *
 * 跨服务调用：
 *  - POST {BILLING_SERVICE_URL}/api/v1/billing/reconcile
 *  - Header: x-api-key: {INTERNAL_API_KEY}
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { REDIS_CLIENT } from '@reelclone/database'
import Redis from 'ioredis'

/** 对账结果列表项（与 billing-service ReconciliationResult 对齐） */
export interface ReconcileResultItem {
  userId: string
  userBalance: number
  txBalance: number
  frozen: number
  expectedBalance: number
  difference: number
  isConsistent: boolean
}

/** 对账结果摘要（与 billing-service ReconciliationSummary 对齐） */
export interface ReconcileSummary {
  totalUsers: number
  inconsistentCount: number
  results: ReconcileResultItem[]
  date?: string
  startedAt: string
  finishedAt: string
}

/** billing-service 统一响应体（ApiResponse 包裹） */
interface ApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** Redis Key 前缀 */
const REDIS_KEY_PREFIX = 'reconcile:results'
/** TTL 7 天 */
const TTL_SECONDS = 7 * 24 * 60 * 60

@Injectable()
export class AdminReconcileService {
  private readonly logger = new Logger(AdminReconcileService.name)
  private readonly billingServiceUrl: string
  private readonly internalApiKey: string

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.billingServiceUrl = (
      process.env.BILLING_SERVICE_URL ?? 'http://billing-service:3006'
    ).replace(/\/$/, '')
    this.internalApiKey = process.env.INTERNAL_API_KEY ?? ''
  }

  // -------------------- 查看对账结果 --------------------

  /**
   * 查看对账结果
   *
   * 从 Redis 读取 `reconcile:results:{date}`，无缓存时返回空数组。
   *
   * @param date YYYY-MM-DD 格式，默认今天
   */
  async getResults(date?: string): Promise<ReconcileResultItem[]> {
    const key = this.buildRedisKey(date)
    const raw = await this.redis.get(key)
    if (!raw) {
      this.logger.log(`对账结果缓存为空 key=${key}`)
      return []
    }
    try {
      const parsed = JSON.parse(raw) as ReconcileResultItem[]
      return Array.isArray(parsed) ? parsed : []
    } catch (err) {
      this.logger.warn(`对账结果缓存解析失败 key=${key} error=${(err as Error).message}`)
      return []
    }
  }

  // -------------------- 手动触发对账 --------------------

  /**
   * 手动触发对账
   *
   * 通过 HTTP 调用 billing-service 的对账 API：
   *   POST {BILLING_SERVICE_URL}/api/v1/billing/reconcile
   *   body: { scope: 'all' | 'userId:xxx' }
   *   Header: x-api-key: {INTERNAL_API_KEY}
   *
   * 对账完成后将不一致记录缓存到 Redis（key: reconcile:results:{date}，TTL 7 天）。
   *
   * @param body 请求体（scope）
   * @param operatorId 操作者 ID（用于日志）
   */
  async triggerReconcile(body: { scope: string }, operatorId: string): Promise<ReconcileSummary> {
    if (!this.internalApiKey) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'INTERNAL_API_KEY 未配置，无法调用 billing-service',
      )
    }

    const url = `${this.billingServiceUrl}/api/v1/billing/reconcile`
    this.logger.log(`管理员 ${operatorId} 触发对账 scope=${body.scope} url=${url}`)

    let summary: ReconcileSummary
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.internalApiKey,
        },
        body: JSON.stringify({ scope: body.scope }),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new BusinessException(
          ErrorCode.INTERNAL_ERROR,
          `billing-service 对账失败: HTTP ${resp.status} ${text}`,
          { scope: body.scope, status: resp.status },
        )
      }

      const payload = (await resp.json()) as ApiResponse<ReconcileSummary>
      if (payload.code !== ErrorCode.SUCCESS) {
        throw new BusinessException(
          payload.code as ErrorCode,
          payload.message || 'billing-service 对账失败',
          { scope: body.scope },
        )
      }
      summary = payload.data
    } catch (err) {
      if (err instanceof BusinessException) {
        throw err
      }
      this.logger.error(`调用 billing-service 对账失败: ${(err as Error).message}`)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '计费服务暂时不可用，请稍后重试', {
        scope: body.scope,
        message: (err as Error).message,
      })
    }

    // 缓存对账结果到 Redis（TTL 7 天）
    await this.cacheResults(summary)

    this.logger.log(
      `对账完成 operatorId=${operatorId} totalUsers=${summary.totalUsers} inconsistent=${summary.inconsistentCount}`,
    )

    return summary
  }

  // -------------------- 内部工具 --------------------

  /** 将对账结果缓存到 Redis（date 优先使用 summary.date，否则今天） */
  private async cacheResults(summary: ReconcileSummary): Promise<void> {
    const date = summary.date ?? this.todayLabel()
    const key = this.buildRedisKey(date)
    const value = JSON.stringify(summary.results ?? [])
    await this.redis.set(key, value, 'EX', TTL_SECONDS)
    this.logger.log(`对账结果已缓存 key=${key} count=${summary.results?.length ?? 0}`)
  }

  /** 构造 Redis Key：reconcile:results:{date} */
  private buildRedisKey(date?: string): string {
    const d = date ?? this.todayLabel()
    return `${REDIS_KEY_PREFIX}:${d}`
  }

  /** 返回今天 00:00 的日期标签（YYYY-MM-DD，本地时区） */
  private todayLabel(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}
