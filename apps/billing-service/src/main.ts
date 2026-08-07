/**
 * billing-service 入口
 *
 * 端口：3006
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard + InternalApiKeyGuard
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'billing-service',
  defaultPort: 3006,
  module: AppModule,
  swagger: {
    title: 'Billing Service API',
    description: '计费服务：积分冻结/结算/退还、流水查询、对账',
    version: '0.1.0',
    tag: 'billing',
  },
})
