/**
 * asset-service 根模块
 *
 * 组合：
 *  - ConfigModule   全局配置（环境变量）
 *  - DatabaseModule 4 个 PostgreSQL 连接（main 库持有 Asset / AvatarGroup）
 *  - OSSModule      阿里云 OSS + STS 服务（全局，签发上传凭证 / 删除对象）
 *  - Passport + JWT 鉴权基础设施
 *  - AssetModule    资产 + 真人形象组业务模块
 *
 * 全局守卫 JwtAuthGuard 通过 APP_GUARD 注册，公开接口使用 @Public() 跳过鉴权。
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PassportModule } from '@nestjs/passport'
import { JwtModule } from '@nestjs/jwt'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import type { StringValue } from 'ms'
import { DatabaseModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import { OSSModule } from '@reelclone/oss'
import { JwtAuthGuard, jwtConfig, resolveJwtSecret } from '@reelclone/common'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { AssetModule } from './asset/asset.module'
import { JwtStrategy } from './auth/jwt.strategy'

@Module({
  imports: [
    // -------------------- 配置 --------------------
    ConfigModule.forRoot({ isGlobal: true, load: [jwtConfig] }),

    // -------------------- 可观测性 --------------------
    LoggerModule.forRoot({ serviceName: 'asset-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // -------------------- 基础设施 --------------------
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    OSSModule.forRoot(),

    // -------------------- 鉴权 --------------------
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET ?? resolveJwtSecret(),
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            process.env.JWT_EXPIRES_IN ??
            '1h') as StringValue,
          issuer: config.get<string>('jwt.issuer') ?? process.env.JWT_ISSUER ?? 'reelclone',
          audience:
            config.get<string>('jwt.audience') ?? process.env.JWT_AUDIENCE ?? 'reelclone-client',
        },
      }),
    }),

    // -------------------- 业务 --------------------
    AssetModule,
  ],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
