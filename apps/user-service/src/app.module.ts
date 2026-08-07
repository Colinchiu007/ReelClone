/**
 * 应用根模块
 *
 * 组合：ConfigModule + DatabaseModule + RedisModule + AuthStrategyModule + JwtModule + UserModule
 * 可观测性：LoggerModule + HealthModule + MetricsModule
 * 全局守卫（JwtAuthGuard + RateLimitGuard）在 main.ts 中通过 useGlobalGuards 注册。
 */
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import {
  AuthStrategyModule,
  RateLimitGuard,
  redisConfig,
  ServiceConfigModule,
  ServiceJwtModule,
} from '@reelclone/common'
import { RedisBridgeModule } from '@reelclone/platform-data'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { UserModule } from './user/user.module'

@Module({
  imports: [
    // 配置加载
    ServiceConfigModule.forRoot({ extraLoad: [redisConfig] }),

    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'user-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // 数据库（4 连接）
    DatabaseModule.forRoot({
      connections: [DATABASE_CONNECTIONS.MAIN, DATABASE_CONNECTIONS.TEMPLATE],
    }),

    // Redis
    RedisModule.forRoot(),

    // JWT 鉴权（共享 AccessTokenStrategy + 用户状态检查）
    // userStatusCheck 启用后，策略会通过 USER_STATUS_CHECKER 检查 FROZEN/DELETED 状态
    // Redis 由 RedisBridgeModule 自动桥接（database REDIS_CLIENT -> common REDIS_CLIENT）
    // imports: [UserModule] 使 USER_STATUS_CHECKER 在 AuthStrategyModule 上下文中可用
    AuthStrategyModule.forRoot({
      userStatusCheck: true,
      imports: [UserModule],
    }),

    // JWT 模块
    ServiceJwtModule.forRoot(),

    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),

    // 业务模块
    UserModule,
  ],
  providers: [
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // RateLimitGuard 需作为 provider 注册（main.ts 通过 app.get(RateLimitGuard) 使用）
    RateLimitGuard,
  ],
})
export class AppModule {}
