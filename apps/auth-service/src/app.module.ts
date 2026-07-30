/**
 * Auth Service 根模块
 *
 * 装配：
 *  - ConfigModule（全局，加载 configuration + jwtConfig）
 *  - DatabaseModule（4 连接）
 *  - RedisModule（黑名单 + 缓存）
 *  - Observability（Pino 日志 + /health + /metrics）
 *  - AuthModule（业务模块）
 *
 * 全局注册：
 *  - APP_FILTER  → AllExceptionsFilter
 *  - APP_INTERCEPTOR → ResponseInterceptor + HttpMetricsInterceptor
 *  - APP_PIPE    → ValidationPipe
 *  - APP_GUARD   → JwtAuthGuard（@Public() 装饰器跳过）
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { DatabaseModule, RedisModule, REDIS_CLIENT as DB_REDIS_CLIENT } from '@reelclone/database'
import {
  AllExceptionsFilter,
  ResponseInterceptor,
  JwtAuthGuard,
  configuration,
  jwtConfig,
  createValidationPipe,
} from '@reelclone/common'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
  OBS_REDIS_CLIENT,
} from '@reelclone/observability'
import { AuthModule } from './auth/auth.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration, jwtConfig],
    }),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'auth-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    DatabaseModule.forRoot(),
    RedisModule.forRoot(),
    AuthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
  ],
})
export class AppModule {}
