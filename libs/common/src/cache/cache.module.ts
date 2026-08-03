/**
 * CacheModule — 统一缓存模块
 *
 * 用法：
 * ```ts
 * // 方式 1：直接传入 Redis 实例
 * CacheModule.forRoot(redis)
 *
 * // 方式 2：从其他 Module 注入（如 REDIS_CLIENT token）
 * CacheModule.forRootAsync({
 *   inject: [REDIS_CLIENT],
 *   useFactory: (redis: Redis) => redis,
 * })
 *
 * // 子模块直接导入即可注入 CacheService
 * @Module({ imports: [CacheModule] })
 * export class SomeModule {}
 * ```
 *
 * 设计：不依赖 @reelclone/database，通过 forRoot() / forRootAsync() 接收外部 Redis 实例。
 */
import { DynamicModule, Global, Module } from '@nestjs/common'
import type Redis from 'ioredis'
import { CACHE_REDIS } from './cache.constants'
import { CacheService } from './cache.service'

export interface CacheModuleAsyncOptions {
  inject?: unknown[]
  useFactory: (...args: unknown[]) => Redis | Promise<Redis>
}

@Global()
@Module({})
export class CacheModule {
  static forRoot(redis: Redis): DynamicModule {
    const redisProvider = { provide: CACHE_REDIS, useValue: redis }
    return {
      module: CacheModule,
      providers: [redisProvider, CacheService],
      exports: [redisProvider, CacheService],
    }
  }

  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    const redisProvider = {
      provide: CACHE_REDIS,
      inject: options.inject ?? [],
      useFactory: options.useFactory,
    }
    return {
      module: CacheModule,
      providers: [redisProvider, CacheService],
      exports: [redisProvider, CacheService],
    }
  }
}
