/**
 * LoggerModule — Pino 日志全局模块
 *
 * 用法：
 * ```ts
 * @Module({
 *   imports: [
 *     LoggerModule.forRoot({ serviceName: 'auth-service' }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * 注册后，LoggerService 可在任意 provider 中通过 DI 注入。
 */
import { type DynamicModule, Global, Module } from '@nestjs/common'
import { OBS_LOG_LEVEL, OBS_SERVICE_NAME } from './logger.config'
import { LoggerService } from './logger.service'

export interface LoggerModuleOptions {
  /** 服务名，写入每条日志的 service 字段 */
  serviceName: string
  /** 日志级别，覆盖环境默认值（dev=debug, prod=info） */
  level?: string
}

@Global()
@Module({})
export class LoggerModule {
  static forRoot(options: LoggerModuleOptions): DynamicModule {
    return {
      module: LoggerModule,
      providers: [
        { provide: OBS_SERVICE_NAME, useValue: options.serviceName },
        { provide: OBS_LOG_LEVEL, useValue: options.level },
        LoggerService,
      ],
      exports: [LoggerService],
    }
  }
}
