/**
 * 服务级 ConfigModule 统一包装
 *
 * 消除各微服务 app.module.ts 中重复的 ConfigModule.forRoot() 配置。
 * 默认加载 configuration + jwtConfig，可选追加自定义配置工厂。
 *
 * 使用方式：
 * ```ts
 * @Module({
 *   imports: [
 *     ServiceConfigModule.forRoot(),                // 标准加载 configuration + jwtConfig
 *     ServiceConfigModule.forRoot({ extraLoad: [redisConfig] }), // 追加额外配置
 *   ],
 * })
 * ```
 */
import { DynamicModule, Module } from '@nestjs/common'
import { ConfigModule, ConfigModuleOptions } from '@nestjs/config'
import type { ConfigFactory } from '@nestjs/config'
import configuration from './configuration'
import { jwtConfig } from './jwt.config'

export interface ServiceConfigModuleOptions
  extends Pick<ConfigModuleOptions, 'isGlobal' | 'envFilePath' | 'cache'> {
  /** 额外配置工厂（如 redisConfig），追加到默认 [configuration, jwtConfig] 之后 */
  extraLoad?: ConfigFactory[]
}

@Module({})
export class ServiceConfigModule {
  static forRoot(options: ServiceConfigModuleOptions = {}): DynamicModule {
    const { extraLoad = [], ...configOptions } = options

    return {
      module: ServiceConfigModule,
      global: configOptions.isGlobal ?? true,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration, jwtConfig, ...extraLoad],
          ...configOptions,
        }),
      ],
    }
  }
}
