/**
 * HealthController — Kubernetes 风格健康检查端点
 *
 * 暴露两个公开端点（不依赖业务路由前缀 /api/v1，由各服务 setGlobalPrefix exclude 处理）：
 *
 * GET /livez — Liveness 探针
 *   进程存活且 HTTP 服务可响应即返回 200，不检查任何依赖。
 *
 * GET /readyz — Readiness 探针
 *   检查依赖（DB / Redis）就绪状态：
 *   - 所有已配置依赖 up → 200
 *   - 任一依赖 down → 503，响应体列出失败依赖
 *   未配置的依赖（指标返回 up）自动跳过，不影响整体状态。
 *
 * 两个端点均标记 @Public()，跳过全局 JWT 鉴权，便于 Compose / Docker / K8s 抓取。
 *
 * 响应体（经 ResponseInterceptor 包装后位于 data 字段）：
 * ```json
 * {
 *   "status": "ok" | "error",
 *   "timestamp": "2026-01-01T00:00:00.000Z",
 *   "service": "auth-service",
 *   "uptime": 3600,
 *   "info": {
 *     "database": { "status": "up", "latency": 5 },
 *     "redis": { "status": "up", "latency": 2 }
 *   }
 * }
 * ```
 */
import { Controller, Get, HttpStatus, Inject, Optional, Res } from '@nestjs/common'
import { Public } from '@reelclone/common'
import { OBS_SERVICE_NAME } from '../logger/logger.config'
import {
  DatabaseHealthIndicator,
  RedisHealthIndicator,
  type HealthResult,
} from './health.indicators'

export interface HealthResponse {
  status: 'ok' | 'error'
  timestamp: string
  service: string
  uptime: number
  /** 依赖健康详情（liveness 不检查依赖时省略） */
  info?: {
    database: HealthResult
    redis: HealthResult
  }
}

/** 最小 HTTP Response 结构：仅需设置状态码的能力 */
interface HttpResponseStatusSetter {
  status(code: number): unknown
}

@Controller()
@Public()
export class HealthController {
  constructor(
    private readonly dbIndicator: DatabaseHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    @Optional() @Inject(OBS_SERVICE_NAME) private readonly serviceName?: string,
  ) {}

  /** 收集依赖健康指标（并发执行） */
  private async gatherInfo(): Promise<{ database: HealthResult; redis: HealthResult }> {
    const [database, redis] = await Promise.all([
      this.dbIndicator.ping(),
      this.redisIndicator.ping(),
    ])
    return { database, redis }
  }

  /**
   * Liveness 探针 — 进程存活即返回 200
   * 不检查依赖，仅确认 HTTP 服务可响应。
   */
  @Get('livez')
  liveness(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: this.serviceName ?? 'unknown',
      uptime: process.uptime(),
    }
  }

  /**
   * Readiness 探针 — 检查依赖（DB / Redis）就绪状态
   * 所有已配置依赖 up 返回 200；任一依赖 down 返回 503 并列出失败依赖。
   */
  @Get('readyz')
  async readiness(
    @Res({ passthrough: true }) res: HttpResponseStatusSetter,
  ): Promise<HealthResponse> {
    const { database, redis } = await this.gatherInfo()
    const allUp = database.status === 'up' && redis.status === 'up'

    if (!allUp) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE)
    }

    return {
      status: allUp ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      service: this.serviceName ?? 'unknown',
      uptime: process.uptime(),
      info: { database, redis },
    }
  }
}
