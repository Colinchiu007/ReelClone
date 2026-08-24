/**
 * Auth Service 根模块
 *
 * 装配：
 *  - ServiceConfigModule（全局，加载 configuration + jwtConfig）
 *  - DatabaseModule（main 连接）
 *  - RedisModule（黑名单 + 缓存）
 *  - Observability（Pino 日志 + /health + /metrics）
 *  - AuthModule（业务模块）
 *
 * 全局注册：
 *  - APP_INTERCEPTOR → ResponseInterceptor + HttpMetricsInterceptor
 *  - APP_PIPE    → ValidationPipe
 *  - APP_GUARD   → JwtAuthGuard（@Public() 装饰器跳过）
 *  - AllExceptionsFilter 由 bootstrapService 统一注册（APP_FILTER 无重复注册）
 */
import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import {
  ResponseInterceptor,
  JwtAuthGuard,
  createValidationPipe,
  ServiceConfigModule,
} from '@reelclone/common'
import { RedisBridgeModule } from '@reelclone/platform-data'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ServiceConfigModule.forRoot({ cache: true }),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'auth-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    RedisModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    AuthModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
