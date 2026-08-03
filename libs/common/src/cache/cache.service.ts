/**
 * 统一缓存服务（Cache-Aside 模式）
 *
 * 封装 ioredis 的 get/set/del，提供一行代码实现缓存优先查询：
 * ```ts
 * const data = await cache.getOrSet('templates:all', 300, () => db.findAll());
 * ```
 *
 * 设计原则：
 * - 零 @reelclone/* 依赖：CACHE_REDIS token 定义在 common 内部
 * - 消费方通过 CacheModule.forRoot({ redis }) 传入客户端实例
 * - TTL 单位统一为秒
 * - key 前缀由 RedisModule.keyPrefix 统一管理（reelclone:）
 * - 所有 JSON 自动序列化/反序列化
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CACHE_REDIS } from './cache.constants'
import type Redis from 'ioredis'

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name)

  constructor(@Inject(CACHE_REDIS) private readonly redis: Redis) {}

  /**
   * Cache-Aside：先查缓存，miss 时执行 fetchFn 并回填
   *
   * @param key 缓存 key（不含前缀）
   * @param ttlSeconds 缓存有效期（秒），0 = 不过期
   * @param fetchFn 缓存未命中时的数据源函数
   * @returns 缓存或数据源返回的值
   */
  async getOrSet<T>(key: string, ttlSeconds: number, fetchFn: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.redis.get(key)
      if (cached !== null) {
        return JSON.parse(cached) as T
      }
    } catch (err) {
      this.logger.warn(`缓存读取失败 key=${key}: ${(err as Error).message}`)
    }

    const value = await fetchFn()

    try {
      const serialized = JSON.stringify(value)
      if (ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds)
      } else {
        await this.redis.set(key, serialized)
      }
    } catch (err) {
      this.logger.warn(`缓存写入失败 key=${key}: ${(err as Error).message}`)
    }

    return value
  }

  /** 读取缓存并反序列化 */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch (err) {
      this.logger.warn(`缓存读取失败 key=${key}: ${(err as Error).message}`)
      return null
    }
  }

  /** 写入缓存（支持 TTL） */
  async set(key: string, value: unknown, ttlSeconds = 0): Promise<void> {
    try {
      const serialized = JSON.stringify(value)
      if (ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds)
      } else {
        await this.redis.set(key, serialized)
      }
    } catch (err) {
      this.logger.warn(`缓存写入失败 key=${key}: ${(err as Error).message}`)
    }
  }

  /** 删除单个 key */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (err) {
      this.logger.warn(`缓存删除失败 key=${key}: ${(err as Error).message}`)
    }
  }

  /**
   * 按 pattern 批量失效
   * 使用 SCAN 避免 KEYS 命令阻塞 Redis
   *
   * @param pattern glob 模式（如 "templates:*"）
   * @returns 删除的 key 数量
   */
  async invalidate(pattern: string): Promise<number> {
    let deleted = 0
    let cursor = '0'
    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) {
          await this.redis.del(...keys)
          deleted += keys.length
        }
      } while (cursor !== '0')
    } catch (err) {
      this.logger.warn(`缓存批量失效失败 pattern=${pattern}: ${(err as Error).message}`)
    }
    return deleted
  }

  /** 检查 key 是否存在 */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key)
      return result === 1
    } catch {
      return false
    }
  }
}
