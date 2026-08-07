/**
 * template-service 入口
 *
 * 端口: 3005
 * 全局前缀: /api/v1
 * 全局: ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'template-service',
  defaultPort: 3005,
  module: AppModule,
  cors: {},
  swagger: {
    title: 'Template Service API',
    description: '模板服务：模板广场、UGC 上传、审核',
    version: '0.1.0',
    tag: 'template',
  },
})
