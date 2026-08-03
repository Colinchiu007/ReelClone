/**
 * workbench-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - TemporalModule.forRootAsync()：Temporal Client（Mock 模式可降级）
 *  - AiModule：AI 能力（Seedance / LLM / PromptEngine）
 *  - JwtModule：JWT 校验
 *  - PassportModule：JWT 策略注册
 *  - WorkbenchModule：业务模块
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT
 */
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  JwtAuthGuard,
  AuthStrategyModule,
  ConfigStoreModule,
  ServiceConfigModule,
  ServiceJwtModule,
  RedisBridgeModule,
} from '@reelclone/common'
import {
  DatabaseModule,
  RedisModule,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { TemporalModule } from '@reelclone/temporal'
import { AiModule } from '@reelclone/ai'
import { WorkbenchModule } from './workbench/workbench.module'

@Module({
  imports: [
    // 环境变量
    ServiceConfigModule.forRoot(),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'workbench-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接）
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    // Redis
    RedisModule.forRoot(),
    // Temporal（从环境变量读取配置）
    TemporalModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        address: config.get<string>('TEMPORAL_ADDRESS') || 'localhost:7233',
        namespace: config.get<string>('TEMPORAL_NAMESPACE') || 'reelclone',
        mockMode: config.get<string>('TEMPORAL_MOCK_MODE') === 'true',
      }),
    }),
    // AI 能力
    AiModule,
    // 运行时配置存储（API Key 热刷新）
    ConfigStoreModule,
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // 业务模块
    WorkbenchModule,
  ],
  providers: [
    // 全局守卫：JWT（默认）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（记录请求耗时/状态码到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
