/**
 * notification-service 根模块
 *
 * 组合：
 *  - ConfigModule         全局配置（环境变量）
 *  - DatabaseModule       4 个 PostgreSQL 连接（main 库持有 Notification 实体）
 *  - RedisModule          ioredis 客户端（Pub/Sub + 心跳缓存）
 *  - AuthModule           Passport + JWT（供全局 JwtAuthGuard 使用）
 *  - NotificationModule   业务模块（控制器 + 网关 + 订阅器 + 服务）
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { jwtConfig } from '@reelclone/common'
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
import { AuthModule } from './auth/auth.module'
import { NotificationModule } from './notification/notification.module'

@Module({
  imports: [
    // -------------------- 配置 --------------------
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [jwtConfig],
      // 显式声明可被验证的字段（便于在容器中提前暴露缺失项）
      cache: true,
    }),

    // -------------------- 可观测性 --------------------
    // Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'notification-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // -------------------- 基础设施 --------------------
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    RedisModule.forRoot(),

    // -------------------- 鉴权 --------------------
    AuthModule,

    // -------------------- 业务 --------------------
    NotificationModule,
  ],
  providers: [
    // HTTP 指标拦截器（记录请求耗时/状态码到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
  ],
})
export class AppModule {}
