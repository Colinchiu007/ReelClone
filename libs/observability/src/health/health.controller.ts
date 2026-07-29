/**
 * HealthController — 健康检查端点
 *
 * GET /health
 * 响应：
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
 *
 * 整体 status 为 "ok" 当且仅当所有已配置的指标均为 "up"。
 * 未配置的依赖（如服务不使用 Redis）自动跳过，不影响整体状态。
 */
import { Controller, Get, Inject, Optional } from '@nestjs/common'
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
  info: {
    database: HealthResult
    redis: HealthResult
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly dbIndicator: DatabaseHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    @Optional() @Inject(OBS_SERVICE_NAME) private readonly serviceName?: string,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.dbIndicator.ping(),
      this.redisIndicator.ping(),
    ])

    const status: 'ok' | 'error' =
      database.status === 'up' && redis.status === 'up' ? 'ok' : 'error'

    return {
      status,
      timestamp: new Date().toISOString(),
      service: this.serviceName ?? 'unknown',
      uptime: process.uptime(),
      info: { database, redis },
    }
  }
}
