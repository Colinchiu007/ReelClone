/**
 * 订单业务模块
 *
 * 导入:
 *  - main 库: Order, Package, UserPackage, User, CreditOperation, CreditOperationOutbox, OrderPaymentEvent 实体
 *  - WechatPayAdapterModule: 根据 profile 绑定 Mock/Real 微信支付适配器
 *
 * 提供:
 *  - OrderService:       订单创建/查询/取消 + 回调处理（含 outbox 写入 + durable inbox）
 *  - WechatPayService:   微信支付门面（委托适配器验签/解密 + 下单参数生成）
 *  - BillingClient:      调用 billing-service 赠送积分
 *  - OutboxConsumer:     paid-grant outbox 投递消费者（定时捞取 PENDING 重试）
 *
 * 控制器:
 *  - OrderController:    api/v1/orders
 *  - WebhookController:  api/v1/webhooks/wechat-pay
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WechatPayAdapterModule } from '@reelclone/adapters-wechat'
import {
  Order,
  Package,
  User,
  UserPackage,
  CreditOperation,
  CreditOperationOutbox,
  OrderPaymentEvent,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { OrderController } from './order.controller'
import { OrderService } from './order.service'
import { OutboxConsumer } from './outbox.consumer'
import { WebhookController } from './webhook.controller'
import { WechatPayService } from './wechat-pay.service'
import { BillingClient } from './billing.client'

@Module({
  imports: [
    WechatPayAdapterModule,
    TypeOrmModule.forFeature(
      [
        Order,
        Package,
        UserPackage,
        User,
        CreditOperation,
        CreditOperationOutbox,
        OrderPaymentEvent,
      ],
      DATABASE_CONNECTIONS.MAIN,
    ),
  ],
  controllers: [OrderController, WebhookController],
  providers: [OrderService, WechatPayService, BillingClient, OutboxConsumer],
  exports: [OrderService, WechatPayService, BillingClient],
})
export class OrderModule {}
