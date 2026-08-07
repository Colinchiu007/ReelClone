/**
 * admin-service 入口
 *
 * 端口：3011
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + RolesGuard
 *
 * 设计说明：
 *  - admin-service 是 HTTP 服务（非微服务 Transport），接收来自 admin-web 的 HTTP 请求
 *  - 全局 JwtAuthGuard：默认所有路由需 JWT，@Public() 跳过
 *  - 全局 RolesGuard：配合 @Roles('ADMIN') 装饰器做 RBAC 角色校验
 *    所有 /admin/* 业务端点应在 Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN')
 *  - 健康检查 /api/v1/admin/health 标记 @Public()，无需鉴权
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'admin-service',
  defaultPort: 3011,
  module: AppModule,
  logger: ['error', 'warn', 'log'],
  portEnvVar: 'ADMIN_SERVICE_PORT',
  swagger: {
    title: 'Admin Service API',
    description: '运营后台：用户/模板/订单/对账管理',
    version: '0.1.0',
    tag: 'admin',
  },
})
