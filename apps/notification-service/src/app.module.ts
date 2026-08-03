/**
 * notification-service 根模块
 *
 * 组合：
 *  - ServiceConfigModule      全局配置（环境变量）
 *  - DatabaseModule           PostgreSQL 连接（main 库持有 Notification 实体）
 *  - RedisModule              ioredis 客户端（Pub/Sub + 心跳缓存）
 *  - AuthModule               Passport + JWT（供全局 JwtAuthGuard 使用）
 *  - NotificationModule       业务模块（控制器 + 网关 + 订阅器 + 服务）
 */
import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { ServiceConfigModule } from '@reelclone/common'
import { RedisBridgeModule } from '@reelclone/platform-data'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { AuthModule } from './auth/auth.module'
import { NotificationModule } from './notification/notification.module'

@Module({
  imports: [
    // -------------------- 配置 --------------------
    ServiceConfigModule.forRoot({ cache: true }),

    // -------------------- 可观测性 --------------------
    // Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'notification-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // -------------------- 基础设施 --------------------
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    RedisModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),

    // -------------------- 鉴权 --------------------
    AuthModule,

    // -------------------- 业务 --------------------
    NotificationModule,
  ],
  providers: [
    // HTTP 指标拦截器（记录请求耗时/状态码到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
