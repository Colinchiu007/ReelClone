/**
 * order-service 根模块
 *
 * 装配：
 *  - ServiceConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - ServiceJwtModule：JWT 签名与校验
 *  - PassportModule：JWT 策略注册
 *  - PackageModule：套餐浏览
 *  - OrderModule：订单与支付
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 */
import { Module } from '@nestjs/common'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  ServiceConfigModule,
  ServiceJwtModule,
  RedisBridgeModule,
  JwtAuthGuard,
  AuthStrategyModule,
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
import { PackageModule } from './package/package.module'
import { OrderModule } from './order/order.module'

@Module({
  imports: [
    // 环境变量
    ServiceConfigModule.forRoot(),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'order-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接）
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    // Redis
    RedisModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),
    // 业务模块
    PackageModule,
    OrderModule,
  ],
  providers: [
    // 全局守卫：JWT（默认），@Public() 跳过
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（记录请求耗时/状态码到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
