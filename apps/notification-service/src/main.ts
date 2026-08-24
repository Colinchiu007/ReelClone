/**
 * notification-service 启动入口
 *
 * - 监听端口 3008（与 docker-compose 中其它服务约定的端口划分一致）
 * - 全局前缀 api/v1，所有 HTTP 路由最终为 /api/v1/notifications/...
 * - 全局注册：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 * - 启用 CORS，便于小程序本地联调
 * - WebSocket 路径 /ws 由 NotificationGateway 处理，不走全局前缀
 */
import { Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { bootstrapService, JwtAuthGuard } from '@reelclone/common'
import { AppModule } from './app.module'

bootstrapService({
  name: 'notification-service',
  defaultPort: 3008,
  module: AppModule,
  bufferLogs: true,
  swagger: {
    title: 'Notification Service API',
    description: '通知服务：站内信、WebSocket 推送',
    version: '0.1.0',
    tag: 'notification',
  },
  configure: (app) => {
    // 全局守卫（JWT）：配合 @Public() 装饰器，默认所有接口都需登录
    app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)))
    // 确保 JwtService 在容器中可被 Gateway 直接注入（显式 get 一次以触发实例化）
    app.get(JwtService)
  },
  extraLogs: (port) => [
    `📡 WebSocket endpoint: ws://localhost:${port}/ws?token=<jwt>`,
    `🔔 REST API base:      http://localhost:${port}/api/v1/notifications`,
  ],
}).catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  new Logger('notification-service').error(`[notification-service] 启动失败：${message}`)
  process.exit(1)
})
