/**
 * billing-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - JwtModule：JWT 签名与校验
 *  - PassportModule：JWT 策略注册
 *  - BillingModule：业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 *  - InternalApiKeyGuard：@InternalApi() 标记的路由需 x-api-key
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import type { StringValue } from 'ms'
import {
  JwtAuthGuard,
  AuthStrategyModule,
  InternalApiKeyGuard,
  jwtConfig,
  configuration,
} from '@reelclone/common'
import {
  DatabaseModule,
  RedisModule,
  REDIS_CLIENT as DB_REDIS_CLIENT,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
  OBS_REDIS_CLIENT,
} from '@reelclone/observability'
import { BillingModule } from './billing/billing.module'

@Module({
  imports: [
    // 环境变量
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, jwtConfig],
    }),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'billing-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接）
    DatabaseModule.forRoot({
      connections: [DATABASE_CONNECTIONS.MAIN, DATABASE_CONNECTIONS.BILLING],
    }),
    // Redis
    RedisModule.forRoot(),
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET,
        signOptions: {
          expiresIn: (config.get<string>('jwt.expiresIn') ?? '1h') as StringValue,
          issuer: config.get<string>('jwt.issuer') ?? 'reelclone',
          audience: config.get<string>('jwt.audience') ?? 'reelclone-client',
        },
      }),
    }),
    // 业务模块
    BillingModule,
  ],
  providers: [
    // 全局守卫：JWT（默认）+ InternalApiKey（按需）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
  ],
})
export class AppModule {}
