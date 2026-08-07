/**
 * benchmark-service 入口
 *
 * 端口：3004
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'benchmark-service',
  defaultPort: 3004,
  module: AppModule,
  swagger: {
    title: 'Benchmark Service API',
    description: '对标服务：视频下载与分析',
    version: '0.1.0',
    tag: 'benchmark',
  },
})
