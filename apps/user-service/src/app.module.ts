/**
 * 应用根模块
 *
 * 组合：ConfigModule + DatabaseModule + RedisModule + AuthStrategyModule + JwtModule + UserModule
 * 可观测性：LoggerModule + HealthModule + MetricsModule
 * 全局守卫（JwtAuthGuard + RateLimitGuard）在 main.ts 中通过 useGlobalGuards 注册。
 */
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import {
  DatabaseModule,
  RedisModule,
  REDIS_CLIENT as DB_REDIS_CLIENT,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import {
  AuthStrategyModule,
  RateLimitGuard,
  REDIS_CLIENT as COMMON_REDIS_CLIENT,
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
    AuthStrategyModule.forRoot({
      userStatusCheck: true,
      redisToken: COMMON_REDIS_CLIENT,
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
    // RateLimitGuard 需注入 common 的 REDIS_CLIENT
    RateLimitGuard,
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 common 的 REDIS_CLIENT
    // （两个库各自用 Symbol() 定义了 REDIS_CLIENT，Symbol 是唯一的，需手动桥接）
    {
      provide: COMMON_REDIS_CLIENT,
      useExisting: DB_REDIS_CLIENT,
    },
  ],
})
export class AppModule {}
