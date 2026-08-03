/**
 * Redis 客户端桥接模块
 *
 * 消除各微服务 app.module.ts 中重复的 OBS_REDIS_CLIENT → REDIS_CLIENT 桥接代码。
 * 将 @reelclone/database 的 REDIS_CLIENT 别名为 @reelclone/observability 的 OBS_REDIS_CLIENT，
 * 使 HealthModule 可直接注入 Redis 客户端，无需每个服务手动桥接。
 *
 * 前置条件：
 * - 服务的 DatabaseModule.forRoot() 必须包含 redis 连接
 * - @reelclone/observability 已安装
 *
 * 使用方式：
 * ```ts
 * @Module({
 *   imports: [
 *     DatabaseModule.forRoot({ connections: ['main', 'redis'] }),
 *     RedisBridgeModule.forRoot(),  // 自动桥接 REDIS_CLIENT → OBS_REDIS_CLIENT
 *     ObservabilityModule,
 *   ],
 * })
 * ```
 */
import { DynamicModule, Module, Provider } from '@nestjs/common'
import { OBS_REDIS_CLIENT } from '@reelclone/observability'
import { REDIS_CLIENT } from '@reelclone/database'

@Module({})
export class RedisBridgeModule {
  static forRoot(): DynamicModule {
    const bridgeProvider: Provider = {
      provide: OBS_REDIS_CLIENT,
      useExisting: REDIS_CLIENT,
    }

    return {
      module: RedisBridgeModule,
      providers: [bridgeProvider],
      exports: [bridgeProvider],
    }
  }
}
