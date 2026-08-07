/**
 * Redis 客户端桥接模块
 *
 * 消除各微服务 app.module.ts 中重复的 REDIS_CLIENT 桥接代码。
 * 将 @reelclone/database 的 REDIS_CLIENT 别名为：
 *  - @reelclone/observability 的 OBS_REDIS_CLIENT（HealthModule 用）
 *  - @reelclone/common 的 REDIS_CLIENT（AuthStrategyModule / RateLimitGuard 用）
 *
 * 前置条件：
 * - 服务的 DatabaseModule.forRoot() 必须包含 redis 连接
 *
 * 使用方式：
 * ```ts
 * @Module({
 *   imports: [
 *     DatabaseModule.forRoot({ connections: ['main', 'redis'] }),
 *     RedisBridgeModule.forRoot(),  // 自动桥接 REDIS_CLIENT -> OBS_REDIS_CLIENT + common REDIS_CLIENT
 *     ObservabilityModule,
 *   ],
 * })
 * ```
 */
import { DynamicModule, Global, Module, Provider } from '@nestjs/common'
import { OBS_REDIS_CLIENT } from '@reelclone/observability'
import { REDIS_CLIENT as DB_REDIS_CLIENT } from '@reelclone/database'
import { REDIS_CLIENT as COMMON_REDIS_CLIENT } from '@reelclone/common'

@Global()
@Module({})
export class RedisBridgeModule {
  static forRoot(): DynamicModule {
    const bridgeProviders: Provider[] = [
      // database REDIS_CLIENT -> observability OBS_REDIS_CLIENT
      { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
      // database REDIS_CLIENT -> common REDIS_CLIENT（AuthStrategyModule / RateLimitGuard 用）
      { provide: COMMON_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
    ]

    return {
      module: RedisBridgeModule,
      providers: bridgeProviders,
      exports: bridgeProviders,
    }
  }
}
