/**
 * HealthModule — 健康检查模块
 *
 * 用法：
 * ```ts
 * @Module({
 *   imports: [
 *     HealthModule.forRoot({ serviceName: 'auth-service' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * 注册 HealthController（GET /health）和健康指标（DB/Redis）。
 * 依赖通过 @Optional() 注入，未配置时自动跳过检查。
 *
 * 若已导入 LoggerModule.forRoot({ serviceName })，则 serviceName 可省略，
 * HealthController 会从 DI 容器中获取 OBS_SERVICE_NAME。
 */
import { type DynamicModule, Module, type Provider } from '@nestjs/common'
import { OBS_SERVICE_NAME } from '../logger/logger.config'
import { HealthController } from './health.controller'
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health.indicators'

export interface HealthModuleOptions {
  /** 服务名（若 LoggerModule 已提供 OBS_SERVICE_NAME 则可省略） */
  serviceName?: string
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      DatabaseHealthIndicator,
      RedisHealthIndicator,
    ]

    // 若显式传入 serviceName，则提供 OBS_SERVICE_NAME（供 HealthController 注入）
    if (options.serviceName) {
      providers.push({ provide: OBS_SERVICE_NAME, useValue: options.serviceName })
    }

    return {
      module: HealthModule,
      controllers: [HealthController],
      providers,
    }
  }
}
