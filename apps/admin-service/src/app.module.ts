/**
 * admin-service 根模块
 *
 * 装配：
 *  - ServiceConfigModule：加载环境变量
 *  - DatabaseModule.forRoot()：3 个 PostgreSQL 连接（main / billing / template）
 *  - RedisModule.forRoot()：ioredis 客户端
 *  - ServiceJwtModule：JWT 鉴权基础设施（与 auth-service 共享 JWT_SECRET）
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
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import {
  JwtAuthGuard,
  RolesGuard,
  AuthStrategyModule,
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
import { AppController } from './app.controller'
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
    ServiceConfigModule.forRoot(),
    // 可观测性：Pino 结构化日志 + /health 端点 + /metrics Prometheus 指标
    LoggerModule.forRoot({ serviceName: 'admin-service' }),
    HealthModule.forRoot(),
    MetricsModule.forRoot(),
    // 数据库（3 个连接：main / billing / template）
    DatabaseModule.forRoot({
      connections: [
        DATABASE_CONNECTIONS.MAIN,
        DATABASE_CONNECTIONS.BILLING,
        DATABASE_CONNECTIONS.TEMPLATE,
      ],
    }),
    // Redis
    RedisModule.forRoot(),
    // Redis 桥接：将 database 的 REDIS_CLIENT 暴露为 observability 的 OBS_REDIS_CLIENT
    RedisBridgeModule.forRoot(),
    // JWT 鉴权（共享 AccessTokenStrategy：token 类型 / jti 黑名单 / 密码修改 / tokenVersion / session family）
    AuthStrategyModule.forRoot(),
    ServiceJwtModule.forRoot(),
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
    // 全局守卫：JWT（默认）+ Roles（RBAC 角色校验）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // HTTP 指标拦截器（自动记录请求总数/耗时到 Prometheus）
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
