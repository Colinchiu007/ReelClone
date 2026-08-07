/**
 * ReelClone user-service 启动入口
 *
 * 端口：3002
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + RateLimitGuard
 */
import { bootstrapService, JwtAuthGuard, RateLimitGuard } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'user-service',
  defaultPort: 3002,
  module: AppModule,
  bufferLogs: true,
  cors: {},
  swagger: {
    title: 'User Service API',
    description: '用户服务：用户信息管理、绑定手机号、短信验证码、修改密码',
    version: '0.1.0',
    tag: 'user',
  },
  configure: (app) => {
    // 全局守卫：JWT 鉴权 + 限流
    app.useGlobalGuards(app.get(JwtAuthGuard), app.get(RateLimitGuard))
  },
})
