/**
 * Redis 配置
 *
 * Redis 7 用于：缓存、限流（令牌桶）、Pub/Sub、任务状态。
 * 通过环境变量 REDIS_HOST / REDIS_PORT / REDIS_PASSWORD 配置。
 *
 * 使用方式：
 * ```ts
 * ConfigModule.forRoot({ load: [redisConfig] })
 * // 注入：@Inject(redisConfig.KEY) private redis: RedisConfig
 * ```
 */
import { registerAs } from '@nestjs/config'

/** Redis 连接配置 */
export interface RedisConfig {
  /** 主机地址 */
  host: string
  /** 端口 */
  port: number
  /** 密码（可选） */
  password?: string
  /** 数据库编号（默认 0） */
  db: number
  /** key 前缀，用于多环境隔离 */
  keyPrefix: string
  /** 连接超时（毫秒） */
  connectTimeout: number
  /** 最大重试次数 */
  maxRetriesPerRequest: number
}

/**
 * Redis 配置工厂
 */
export const redisConfig = registerAs('redis', (): RedisConfig => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),
  keyPrefix: process.env.REDIS_PREFIX ?? 'reelclone:',
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT ?? '10000', 10),
  maxRetriesPerRequest: 3,
}))
