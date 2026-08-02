/**
 * order-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - JwtModule：JWT 签名与校验
 *  - PassportModule：JWT 策略注册
 *  - PackageModule：套餐浏览
 *  - OrderModule：订单与支付
 *
 * 全局守卫：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 */
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { JwtAuthGuard, resolveJwtSecret } from '@reelclone/common'
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
import { JwtStrategy } from './auth/jwt.strategy'
import { PackageModule } from './package/package.module'
import { OrderModule } from './order/order.module'

@Module({
  imports: [
    // 环境变量
    ConfigModule.forRoot({ isGlobal: true }),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'order-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接）
    DatabaseModule.forRoot({ connections: [DATABASE_CONNECTIONS.MAIN] }),
    // Redis
    RedisModule.forRoot(),
    // Passport + JWT
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: {
        // expiresIn 期望 ms 包的 StringValue 类型，这里用断言绕过严格类型检查
        expiresIn: (process.env.JWT_EXPIRES_IN || '1h') as unknown as never,
      },
    }),
    // 业务模块
    PackageModule,
    OrderModule,
  ],
  providers: [
    JwtStrategy,
    // 全局守卫：JWT（默认），@Public() 跳过
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // HTTP 指标拦截器（记录请求耗时/状态码到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
  ],
})
export class AppModule {}
