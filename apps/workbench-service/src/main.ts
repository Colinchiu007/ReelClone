/**
 * workbench-service 入口
 *
 * 端口：3007
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'workbench-service',
  defaultPort: 3007,
  module: AppModule,
  swagger: {
    title: 'Workbench Service API',
    description: '工作台服务：生成任务提交、查询、取消',
    version: '0.1.0',
    tag: 'workbench',
  },
  extraLogs: () => [
    `Temporal mock mode: ${process.env.TEMPORAL_MOCK_MODE === 'true' ? 'ENABLED' : 'DISABLED'}`,
  ],
})
