/**
 * ReelClone asset-service 启动入口
 *
 * 端口：3003
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'asset-service',
  defaultPort: 3003,
  module: AppModule,
  cors: {},
  swagger: {
    title: 'Asset Service API',
    description: '资产服务：数字人/语音包/素材管理',
    version: '0.1.0',
    tag: 'asset',
  },
})
