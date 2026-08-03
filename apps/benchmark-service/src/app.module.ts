/**
 * benchmark-service 根模块
 *
 * 装配：
 *  - ServiceConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：benchmark 连接
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - ServiceJwtModule：JWT 鉴权基础设施
 *  - BenchmarkModule：对标解析业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 */
import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  JwtAuthGuard,
  AuthStrategyModule,
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
import { BenchmarkModule } from './benchmark/benchmark.module'

@Module({
  imports: [
    // 环境变量
    ServiceConfigModule.forRoot(),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'benchmark-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（benchmark 连接）
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.BENCHMARK] }),
    // Redis
    RedisModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),
    // 业务模块
    BenchmarkModule,
  ],
  providers: [
    // 全局守卫：JWT
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
