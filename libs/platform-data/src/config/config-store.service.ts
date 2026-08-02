/**
 * ConfigStoreService — 运行时配置存储服务
 *
 * 职责：
 * - 从 DB 读取配置（通过 TypeORM Repository<SystemConfig>）
 * - Redis 缓存（key: `config:{configKey}`，TTL 5 分钟）
 * - Redis Pub/Sub 热刷新（channel: `config:updated`，收到消息清除缓存）
 *
 * 用法：
 *   const value = await configStore.get('seedance_api_keys')
 *   const keys = await configStore.getApiKeys('seedance')
 *   await configStore.set('seedance_api_keys', 'key1,key2,key3')
 *
 * 热刷新机制：
 * - set() 写入 DB 后，同步更新本地 Redis 缓存并发布 Pub/Sub 通知
 * - 所有实例订阅 `config:updated` 频道，收到通知后删除对应缓存 key
 * - 下次 get() 时缓存未命中，从 DB 重新加载
 */
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type Redis from 'ioredis'
import { SystemConfig, DATABASE_CONNECTIONS, REDIS_CLIENT } from '@reelclone/database'
import { CONFIG_STORE_SERVICE, type IConfigStore } from '@reelclone/common'

/** Redis 缓存 key 前缀 */
const CACHE_KEY_PREFIX = 'config:'

/** 缓存 TTL（5 分钟，单位秒） */
const CACHE_TTL_SECONDS = 5 * 60

/** Pub/Sub 频道 */
const PUBSUB_CHANNEL = 'config:updated'

/** Provider 名称到配置 key 的映射 */
const PROVIDER_KEY_MAP: Record<string, string> = {
  seedance: 'seedance_api_keys',
  llm: 'llm_api_key',
  oss: 'oss_access_key_id',
}

/** 反向映射：配置 key → provider 名称（用于 Pub/Sub 通知时定位 provider 回调） */
const CONFIG_KEY_TO_PROVIDER: Record<string, string> = Object.entries(PROVIDER_KEY_MAP).reduce(
  (acc, [provider, key]) => {
    acc[key] = provider
    return acc
  },
  {} as Record<string, string>,
)

/**
 * ConfigStoreService 实现
 *
 * 实现 IConfigStore 接口，通过 CONFIG_STORE_SERVICE Token 提供。
 * 同时订阅 Redis Pub/Sub 频道，实现跨实例缓存失效。
 */
@Injectable()
export class ConfigStoreService implements IConfigStore, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigStoreService.name)
  /** Pub/Sub 订阅客户端（独立连接，避免阻塞主连接） */
  private subscriber?: Redis
  /** 当前实例已订阅的频道标记 */
  private subscribed = false
  /** Key 更新回调注册表（provider → 回调列表） */
  private readonly keyUpdateCallbacks = new Map<string, Array<() => void | Promise<void>>>()

  constructor(
    @InjectRepository(SystemConfig, DATABASE_CONNECTIONS.MAIN)
    private readonly repo: Repository<SystemConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** 注入 Token（同时供外部模块 useClass/provide 使用） */
  static readonly TOKEN = CONFIG_STORE_SERVICE

  // -------------------- 生命周期 --------------------

  async onModuleInit(): Promise<void> {
    try {
      // 复制主连接配置，创建独立订阅连接
      // 注意：ioredis 的 duplicate 会继承主连接的配置
      this.subscriber = (this.redis as unknown as { duplicate(): Redis }).duplicate()
      await this.subscriber.subscribe(PUBSUB_CHANNEL)
      this.subscriber.on('message', (channel: string, message: string) => {
        if (channel !== PUBSUB_CHANNEL) return
        this.handleUpdate(message).catch((err) => {
          this.logger.warn(`处理配置更新通知失败: ${(err as Error).message}`)
        })
      })
      this.subscribed = true
      this.logger.log(`已订阅 Redis 频道 ${PUBSUB_CHANNEL}，启用配置热刷新`)
    } catch (err) {
      this.logger.warn(`订阅 Redis Pub/Sub 失败，热刷新将不可用: ${(err as Error).message}`)
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.subscriber && this.subscribed) {
        await this.subscriber.unsubscribe(PUBSUB_CHANNEL)
        await this.subscriber.quit()
      }
    } catch {
      // 忽略关闭错误
    }
  }

  // -------------------- IConfigStore 实现 --------------------

  /** {@inheritDoc IConfigStore.get} */
  async get(key: string): Promise<string | null> {
    const cacheKey = this.cacheKey(key)
    try {
      // 1. 先查 Redis 缓存
      const cached = await this.redis.get(cacheKey)
      if (cached !== null) {
        return cached
      }
    } catch (err) {
      this.logger.warn(`读取 Redis 缓存失败 key=${cacheKey}: ${(err as Error).message}`)
    }

    // 2. 缓存未命中，查 DB
    const row = await this.repo.findOne({ where: { configKey: key } })
    const value = row?.configValue ?? null

    // 3. 回填缓存（仅在值存在时）
    if (value !== null) {
      try {
        await this.redis.set(cacheKey, value, 'EX', CACHE_TTL_SECONDS)
      } catch (err) {
        this.logger.warn(`回填 Redis 缓存失败 key=${cacheKey}: ${(err as Error).message}`)
      }
    }

    return value
  }

  /** {@inheritDoc IConfigStore.set} */
  async set(key: string, value: string): Promise<void> {
    // 1. 写 DB（upsert：存在则更新，不存在则插入）
    await this.repo.upsert(
      {
        configKey: key,
        configValue: value,
      },
      ['configKey'],
    )

    // 2. 更新 Redis 缓存
    const cacheKey = this.cacheKey(key)
    try {
      await this.redis.set(cacheKey, value, 'EX', CACHE_TTL_SECONDS)
    } catch (err) {
      this.logger.warn(`更新 Redis 缓存失败 key=${cacheKey}: ${(err as Error).message}`)
    }

    // 3. 发布 Pub/Sub 通知（其他实例收到后清除缓存）
    try {
      await this.redis.publish(PUBSUB_CHANNEL, key)
    } catch (err) {
      this.logger.warn(`发布配置更新通知失败 key=${key}: ${(err as Error).message}`)
    }

    this.logger.log(`配置已更新 key=${key}`)
  }

  /** {@inheritDoc IConfigStore.getApiKeys} */
  async getApiKeys(provider: string): Promise<string[]> {
    const configKey = PROVIDER_KEY_MAP[provider] ?? `${provider}_api_keys`
    const value = await this.get(configKey)
    if (!value) return []
    return value
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
  }

  /** {@inheritDoc IConfigStore.onKeyUpdate} */
  onKeyUpdate(provider: string, callback: () => void | Promise<void>): void {
    const callbacks = this.keyUpdateCallbacks.get(provider) ?? []
    callbacks.push(callback)
    this.keyUpdateCallbacks.set(provider, callbacks)
    this.logger.log(`已注册 Provider=${provider} 的 Key 更新回调`)
  }

  // -------------------- 内部方法 --------------------

  /** 构造 Redis 缓存 key */
  private cacheKey(configKey: string): string {
    return `${CACHE_KEY_PREFIX}${configKey}`
  }

  /**
   * 处理 Pub/Sub 更新通知：
   * 1. 删除对应缓存（下次 get 从 DB 重新加载）
   * 2. 触发已注册的 Provider 回调（主动调用 reloadKeys 刷新内存 Key）
   */
  private async handleUpdate(configKey: string): Promise<void> {
    // 1. 清除缓存
    const cacheKey = this.cacheKey(configKey)
    try {
      await this.redis.del(cacheKey)
      this.logger.debug(`已清除缓存 key=${cacheKey}（收到热刷新通知）`)
    } catch (err) {
      this.logger.warn(`清除缓存失败 key=${cacheKey}: ${(err as Error).message}`)
    }

    // 2. 触发 Provider 回调（主动 reloadKeys）
    const provider = CONFIG_KEY_TO_PROVIDER[configKey]
    if (provider) {
      const callbacks = this.keyUpdateCallbacks.get(provider) ?? []
      for (const cb of callbacks) {
        try {
          await cb()
        } catch (err) {
          this.logger.warn(
            `Provider=${provider} 的 Key 更新回调执行失败: ${(err as Error).message}`,
          )
        }
      }
    }
  }
}
