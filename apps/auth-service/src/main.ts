/**
 * Auth Service 启动入口
 *
 * - 全局前缀：api/v1
 * - 全局过滤器：AllExceptionsFilter
 * - 全局拦截器：ResponseInterceptor
 * - 全局 Pipe：ValidationPipe（带 class-validator）
 * - Swagger 文档：/api/docs（仅非 production 环境）
 * - 默认监听端口：3001
 */
import { Logger } from '@nestjs/common'
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

bootstrapService({
  name: 'auth-service',
  defaultPort: 3001,
  module: AppModule,
  bufferLogs: true,
  swagger: {
    title: 'Auth Service API',
    description: '认证服务：微信小程序登录 / Token 刷新 / 登出（黑名单）',
    version: '0.1.0',
    tag: 'auth',
  },
  extraLogs: () => [
    '  → POST /api/v1/auth/wechat-login',
    '  → POST /api/v1/auth/refresh-token',
    '  → POST /api/v1/auth/logout',
  ],
}).catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  new Logger('auth-service').error(`auth-service bootstrap failed: ${message}`)
  process.exit(1)
})
