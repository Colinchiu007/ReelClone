/**
 * TemporalModule - NestJS 动态模块
 *
 * 提供 TemporalService 供业务服务注入，启动工作流。
 *
 * 用法：
 * ```ts
 * @Module({
 *   imports: [
 *     ConfigModule.forRoot({ isGlobal: true }),
 *     TemporalModule.forRoot(),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * 异步配置：
 * ```ts
 * TemporalModule.forRootAsync({
 *   inject: [ConfigService],
 *   useFactory: (config: ConfigService) => ({
 *     address: config.get('TEMPORAL_ADDRESS'),
 *     namespace: config.get('TEMPORAL_NAMESPACE'),
 *   }),
 * })
 * ```
 */
import { DynamicModule, Global, Module, type Provider } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TemporalService } from './temporal.service'
import type { TemporalClientConfig } from './client/temporal.client'

/** Temporal 模块配置接口 */
export interface TemporalModuleOptions extends TemporalClientConfig {
  /** 是否启用 Mock 模式（开发环境默认 true） */
  mockMode?: boolean
}

/** 异步配置工厂接口 */
export interface TemporalModuleAsyncOptions {
  inject?: any[]
  useFactory: (...args: any[]) => Promise<TemporalModuleOptions> | TemporalModuleOptions
}

/** 模块配置 Token */
export const TEMPORAL_OPTIONS = 'TEMPORAL_OPTIONS'

/**
 * Temporal 全局动态模块
 */
@Global()
@Module({})
export class TemporalModule {
  /**
   * 同步配置
   */
  static forRoot(options?: TemporalModuleOptions): DynamicModule {
    return {
      module: TemporalModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: TEMPORAL_OPTIONS,
          useValue: options ?? {},
        },
        TemporalService,
      ],
      exports: [TemporalService],
    }
  }

  /**
   * 异步配置（从 ConfigService 读取环境变量）
   */
  static forRootAsync(options: TemporalModuleAsyncOptions): DynamicModule {
    const asyncProvider: Provider = {
      provide: TEMPORAL_OPTIONS,
      inject: options.inject ?? [ConfigService],
      useFactory: options.useFactory,
    }

    return {
      module: TemporalModule,
      imports: [ConfigModule],
      providers: [asyncProvider, TemporalService],
      exports: [TemporalService],
    }
  }
}

/** 导出默认配置工厂（从环境变量读取） */
export function defaultTemporalOptions(config: ConfigService): TemporalModuleOptions {
  return {
    address: config.get<string>('TEMPORAL_ADDRESS') || 'localhost:7233',
    namespace: config.get<string>('TEMPORAL_NAMESPACE') || 'reelclone',
    mockMode: config.get<string>('TEMPORAL_MOCK_MODE') === 'true',
  }
}
