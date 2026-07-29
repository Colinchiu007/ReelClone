/**
 * 健康指标 — 数据库 & Redis
 *
 * 通过 DI 可选注入 TypeORM DataSource（main 连接）和 Redis 客户端，
 * 执行简单查询/PING 判断存活，返回包含延迟的 HealthResult。
 *
 * 若服务未导入 TypeOrmModule / 未提供 OBS_REDIS_CLIENT，
 * @Optional() 注入为 undefined，指标返回 { status: 'up' }（跳过检查，不影响整体健康状态）。
 *
 * Redis 集成方式（在微服务 AppModule 中）：
 * ```ts
 * import { REDIS_CLIENT } from '@reelclone/database'
 * import { OBS_REDIS_CLIENT } from '@reelclone/observability'
 *
 * @Module({
 *   providers: [
 *     { provide: OBS_REDIS_CLIENT, useExisting: REDIS_CLIENT },
 *   ],
 * })
 * ```
 */
import { Inject, Injectable, Optional } from '@nestjs/common'
import { getDataSourceToken } from '@nestjs/typeorm'
import { type DataSource } from 'typeorm'
import type Redis from 'ioredis'

/** 默认检查的数据库连接名 */
const DEFAULT_DB_CONNECTION = 'main'

/** Redis 客户端注入 Token（消费方需将 REDIS_CLIENT 别名到此 Token） */
export const OBS_REDIS_CLIENT = Symbol('OBS_REDIS_CLIENT')

/** 单项健康检查结果 */
export interface HealthResult {
  status: 'up' | 'down'
  /** 响应延迟（毫秒） */
  latency?: number
  /** 失败原因 */
  error?: string
}

/**
 * 数据库健康指标
 *
 * 执行 `SELECT 1` 判断数据库连接是否存活。
 * 若 DataSource 未配置（服务不使用数据库），返回 { status: 'up' } 跳过检查。
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Optional()
    @Inject(getDataSourceToken(DEFAULT_DB_CONNECTION))
    private readonly dataSource?: DataSource,
  ) {}

  async ping(): Promise<HealthResult> {
    if (!this.dataSource) {
      return { status: 'up' }
    }
    if (!this.dataSource.isInitialized) {
      return { status: 'down', error: 'database not initialized' }
    }
    const start = Date.now()
    try {
      await this.dataSource.query('SELECT 1')
      return { status: 'up', latency: Date.now() - start }
    } catch (e) {
      return { status: 'down', error: (e as Error).message }
    }
  }
}

/**
 * Redis 健康指标
 *
 * 执行 `PING` 判断 Redis 连接是否存活。
 * 若 Redis 客户端未配置（OBS_REDIS_CLIENT 未提供），返回 { status: 'up' } 跳过检查。
 */
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Optional() @Inject(OBS_REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async ping(): Promise<HealthResult> {
    if (!this.redis) {
      return { status: 'up' }
    }
    const start = Date.now()
    try {
      const res = await this.redis.ping()
      if (res === 'PONG') {
        return { status: 'up', latency: Date.now() - start }
      }
      return { status: 'down', error: `unexpected response: ${res}` }
    } catch (e) {
      return { status: 'down', error: (e as Error).message }
    }
  }
}
