/**
 * 服务级 JwtModule 统一包装
 *
 * 消除各微服务 app.module.ts 中重复的 JwtModule.registerAsync() 三层 fallback。
 * 标准解析链：ConfigService['jwt'] → process.env → resolveJwtSecret()
 *
 * 使用方式：
 * ```ts
 * @Module({
 *   imports: [ServiceJwtModule.forRoot()],  // 替代 ~50 行重复代码
 * })
 * ```
 */
import { DynamicModule, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt'
import { resolveJwtSecret } from './jwt.config'
import type { JwtConfig } from './jwt.config'

export interface ServiceJwtModuleOptions {
  /** 是否注册为全局模块，默认 true */
  isGlobal?: boolean
  /** 附加 JwtModule 选项（如 secret/secretFactory 覆盖） */
  overrides?: Partial<JwtModuleOptions>
}

@Module({})
export class ServiceJwtModule {
  static forRoot(options: ServiceJwtModuleOptions = {}): DynamicModule {
    const { isGlobal = true, overrides = {} } = options

    return {
      module: ServiceJwtModule,
      global: isGlobal,
      imports: [
        JwtModule.registerAsync({
          global: true,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (cfg: ConfigService): JwtModuleOptions => {
            // 优先从 ConfigService 获取（ServiceConfigModule 已加载 jwtConfig）
            const jwtCfg = cfg.get<JwtConfig>('jwt')

            if (jwtCfg?.secret && jwtCfg.secret.length >= 32) {
              return {
                secret: jwtCfg.secret,
                signOptions: {
                  expiresIn: jwtCfg.expiresIn,
                  issuer: jwtCfg.issuer,
                  audience: jwtCfg.audience,
                },
              }
            }

            // 回退到环境变量 + resolveJwtSecret
            return {
              secret: resolveJwtSecret(),
              signOptions: {
                expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
                issuer: process.env.JWT_ISSUER ?? 'reelclone',
                audience: process.env.JWT_AUDIENCE ?? 'reelclone-client',
              },
            }
          },
          ...overrides,
        }),
      ],
    }
  }
}
