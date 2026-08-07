/**
 * order-service 入口
 *
 * 端口：3009
 * 全局前缀：api/v1
 * 全局组件：ValidationPipe + ResponseInterceptor + AllExceptionsFilter + JwtAuthGuard
 * rawBody: true（保留原始请求体，供微信支付回调验签使用）
 */
import { bootstrapService } from '@reelclone/common'
import { AppModule } from './app.module'

void bootstrapService({
  name: 'order-service',
  defaultPort: 3009,
  module: AppModule,
  rawBody: true,
  swagger: {
    title: 'Order Service API',
    description: '订单服务：套餐购买、微信支付、订单管理',
    version: '0.1.0',
    tag: 'order',
  },
})
