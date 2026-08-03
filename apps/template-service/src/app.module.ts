/**
 * template-service 根模块
 *
 * 装配:
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - TemporalModule.forRootAsync()：Temporal Client（用于启动模板生成工作流）
 *  - PassportModule + JwtModule：JWT 鉴权基础设施
 *  - TemplateModule：模板浏览/收藏/行业偏好/用户上传视频转模板业务模块
 *
 * 全局注册 JwtAuthGuard（通过 APP_GUARD），公开接口使用 @Public() 装饰器跳过鉴权。
 */
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  JwtAuthGuard,
  InternalApiKeyGuard,
  AuthStrategyModule,
  ServiceConfigModule,
  ServiceJwtModule,
  CacheModule,
} from '@reelclone/common'
import { RedisBridgeModule } from '@reelclone/platform-data'
import {
  DatabaseModule,
  RedisModule,
  DATABASE_CONNECTIONS,
  REDIS_CLIENT,
} from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { TemporalModule } from '@reelclone/temporal'
import { TemplateModule } from './template/template.module'

@Module({
  imports: [
    // 环境变量
    ServiceConfigModule.forRoot(),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'template-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接）
    DatabaseModule.forRoot({
      connections: [DATABASE_CONNECTIONS.MAIN, DATABASE_CONNECTIONS.TEMPLATE],
    }),
    // Redis
    RedisModule.forRoot(),
    // 缓存（复用 REDIS_CLIENT 实例）
    CacheModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (redis: any) => redis,
    }),
    // Temporal（用户上传视频转模板异步工作流）
    TemporalModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        address: config.get<string>('TEMPORAL_ADDRESS') || 'localhost:7233',
        namespace: config.get<string>('TEMPORAL_NAMESPACE') || 'reelclone',
        mockMode: config.get<string>('TEMPORAL_MOCK_MODE') === 'true',
      }),
    }),
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // 业务模块
    TemplateModule,
  ],
  providers: [
    // 全局守卫：JWT（默认）+ InternalApiKey（@InternalApi 标记的路由校验 x-api-key）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: InternalApiKeyGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
