/**
 * 应用根模块
 *
 * 组合：ConfigModule + DatabaseModule + RedisModule + JwtModule + PassportModule + UserModule
 * 可观测性：LoggerModule + HealthModule + MetricsModule
 * 全局守卫（JwtAuthGuard + RateLimitGuard）在 main.ts 中通过 useGlobalGuards 注册。
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { APP_INTERCEPTOR } from '@nestjs/core'
import type { StringValue } from 'ms'
import {
  DatabaseModule,
  RedisModule,
  REDIS_CLIENT as DB_REDIS_CLIENT,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import {
  JwtAuthGuard,
  RateLimitGuard,
  REDIS_CLIENT as COMMON_REDIS_CLIENT,
  configuration,
  databaseConfig,
  jwtConfig,
  redisConfig,
} from '@reelclone/common'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
  OBS_REDIS_CLIENT,
} from '@reelclone/observability'
import { UserModule } from './user/user.module'

@Module({
  imports: [
    // 配置加载
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, databaseConfig, redisConfig, jwtConfig],
    }),

    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'user-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),

    // 数据库（4 连接）
    DatabaseModule.forRoot({
      connections: [DATABASE_CONNECTIONS.MAIN, DATABASE_CONNECTIONS.TEMPLATE],
    }),

    // Redis
    RedisModule.forRoot(),

    // Passport JWT
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // JWT 模块（异步注册，从环境变量读取配置）
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.get<string>('jwt.expiresIn') as StringValue,
          issuer: config.get<string>('jwt.issuer'),
          audience: config.get<string>('jwt.audience'),
        },
      }),
    }),

    // 业务模块
    UserModule,
  ],
  providers: [
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // JwtAuthGuard — main.ts 通过 app.get(JwtAuthGuard) 获取
    JwtAuthGuard,
    // RateLimitGuard 需注入 common 的 REDIS_CLIENT
    RateLimitGuard,
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 common 的 REDIS_CLIENT
    // （两个库各自用 Symbol() 定义了 REDIS_CLIENT，Symbol 是唯一的，需手动桥接）
    {
      provide: COMMON_REDIS_CLIENT,
      useExisting: DB_REDIS_CLIENT,
    },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    {
      provide: OBS_REDIS_CLIENT,
      useExisting: DB_REDIS_CLIENT,
    },
  ],
})
export class AppModule {}
