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
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  JwtAuthGuard,
  AuthStrategyModule,
  InternalApiKeyGuard,
  ServiceConfigModule,
  ServiceJwtModule,
} from '@reelclone/common'
import { RedisBridgeModule } from '@reelclone/platform-data'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { BillingModule } from './billing/billing.module'

@Module({
  imports: [
    // 环境变量
    ServiceConfigModule.forRoot(),
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
    ServiceJwtModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // 业务模块
    BillingModule,
  ],
  providers: [
    // 全局守卫：JWT（默认）+ InternalApiKey（按需）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
