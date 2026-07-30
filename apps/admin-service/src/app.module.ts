/**
 * admin-service 根模块
 *
 * 装配：
 *  - ConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：4 个 PostgreSQL 连接（main / billing / template / benchmark）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - PassportModule + JwtModule：JWT 鉴权基础设施（与 auth-service 共享 JWT_SECRET）
 *  - AppController：健康检查端点
 *  - AdminUserModule：用户管理（列表/封禁/调账/角色变更）
 *  - AdminReviewModule：审核工作台（模板+形象组授权审核）
 *  - AdminContentModule：内容管理（作品下架/模板上下架）
 *  - AdminPackageModule：套餐管理（CRUD+上下架）
 *  - AdminOrderModule：订单管理（查询/退款）
 *
 * 全局守卫（按注册顺序执行）：
 *  - JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 *  - RolesGuard：配合 @Roles() 装饰器做 RBAC 角色校验
 *
 * 约定：
 *  - 所有 /admin/* 业务端点默认需要 ADMIN 角色
 *  - 实现方式：在业务 Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN')
 *  - 公开端点（如健康检查）使用 @Public() 跳过 JWT 鉴权
 */
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import {
  JwtAuthGuard,
  RolesGuard,
  configuration,
  jwtConfig,
  resolveJwtSecret,
} from '@reelclone/common'
import { DatabaseModule, RedisModule, REDIS_CLIENT as DB_REDIS_CLIENT } from '@reelclone/database'
import {
  LoggerModule,
  HealthModule,
  MetricsModule,
  HttpMetricsInterceptor,
  OBS_REDIS_CLIENT,
} from '@reelclone/observability'
import { AppController } from './app.controller'
import { JwtStrategy } from './auth/jwt.strategy'
import { AdminUserModule } from './admin-user/admin-user.module'
import { AdminReviewModule } from './admin-review/admin-review.module'
import { AdminContentModule } from './admin-content/admin-content.module'
import { AdminPackageModule } from './admin-package/admin-package.module'
import { AdminOrderModule } from './admin-order/admin-order.module'
import { AdminStatsModule } from './admin-stats/admin-stats.module'
import { AdminReconcileModule } from './admin-reconcile/admin-reconcile.module'
import { AdminNotificationModule } from './admin-notification/admin-notification.module'
import { AdminConfigModule } from './admin-config/admin-config.module'

@Module({
  imports: [
    // 环境变量
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration, jwtConfig],
    }),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'admin-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（4 个连接：main / billing / template / benchmark）
    DatabaseModule.forRoot(),
    // Redis
    RedisModule.forRoot(),
    // Passport + JWT（与 auth-service 共享 JWT_SECRET）
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET ?? resolveJwtSecret(),
        signOptions: {
          // 环境变量为 string，ms.StringValue 是模板字面量类型，需断言
          expiresIn: (config.get<string>('jwt.expiresIn') ??
            process.env.JWT_EXPIRES_IN ??
            '1h') as any,
          issuer: config.get<string>('jwt.issuer') ?? process.env.JWT_ISSUER ?? 'reelclone',
          audience:
            config.get<string>('jwt.audience') ?? process.env.JWT_AUDIENCE ?? 'reelclone-client',
        },
      }),
    }),
    // 业务模块
    AdminUserModule,
    AdminReviewModule,
    AdminContentModule,
    AdminPackageModule,
    AdminOrderModule,
    AdminStatsModule,
    AdminReconcileModule,
    AdminNotificationModule,
    AdminConfigModule,
  ],
  controllers: [AppController],
  providers: [
    JwtStrategy,
    // 全局守卫：JWT（默认）+ Roles（RBAC 角色校验）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    // 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    { provide: OBS_REDIS_CLIENT, useExisting: DB_REDIS_CLIENT },
  ],
})
export class AppModule {}
