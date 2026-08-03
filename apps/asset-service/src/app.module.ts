/**
 * asset-service 根模块
 *
 * 组合：
 *  - ServiceConfigModule   全局配置（环境变量）
 *  - DatabaseModule        PostgreSQL 连接（main 库持有 Asset / AvatarGroup）
 *  - OSSModule             阿里云 OSS + STS 服务（全局，签发上传凭证 / 删除对象）
 *  - ServiceJwtModule      JWT 鉴权基础设施
 *  - AssetModule           资产 + 真人形象组业务模块
 *
 * 全局守卫 JwtAuthGuard 通过 APP_GUARD 注册，公开接口使用 @Public() 跳过鉴权。
 */
import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { DatabaseModule, RedisModule, DATABASE_CONNECTIONS } from '@reelclone/database'
import { OSSModule } from '@reelclone/oss'
import {
  JwtAuthGuard,
  AuthStrategyModule,
  ServiceConfigModule,
  ServiceJwtModule,
  RedisBridgeModule,
} from '@reelclone/common'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
} from '@reelclone/observability'
import { AssetModule } from './asset/asset.module'

@Module({
  imports: [
    // -------------------- 配置 --------------------
    ServiceConfigModule.forRoot(),

    // -------------------- 可观测性 --------------------
    LoggerModule.forRoot({ serviceName: 'asset-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // -------------------- 基础设施 --------------------
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    RedisModule.forRoot(),
    OSSModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),

    // -------------------- 鉴权 --------------------
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),

    // -------------------- 业务 --------------------
    AssetModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
