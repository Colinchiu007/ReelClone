import { DynamicModule, Global, Module } from '@nestjs/common';
import Redis from 'ioredis';

/** Redis 客户端注入 Token */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export interface RedisModuleOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

/**
 * Redis 配置模块（基于 ioredis）
 *
 * 用法：
 *   RedisModule.forRoot()
 *   constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}
 */
@Global()
@Module({})
export class RedisModule {
  /** 从环境变量初始化 Redis 客户端 */
  static forRoot(options?: RedisModuleOptions): DynamicModule {
    const redisProvider = {
      provide: REDIS_CLIENT,
      useFactory: (): Redis => {
        return new Redis({
          host: options?.host || process.env.REDIS_HOST || 'localhost',
          port: options?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
          password: options?.password || process.env.REDIS_PASSWORD || undefined,
          db: options?.db ?? 0,
          keyPrefix: options?.keyPrefix,
          lazyConnect: false,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        });
      },
    };

    return {
      module: RedisModule,
      providers: [redisProvider],
      exports: [redisProvider],
    };
  }
}
