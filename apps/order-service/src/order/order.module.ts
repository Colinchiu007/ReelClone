/**
 * 订单业务模块
 *
 * 导入:
 *  - main 库: Order, Package, UserPackage, User 实体
 *
 * 提供:
 *  - OrderService:       订单创建/查询/取消 + 回调处理
 *  - WechatPayService:   微信支付（含 Mock 模式）
 *  - BillingClient:      调用 billing-service 赠送积分
 *
 * 控制器:
 *  - OrderController:    api/v1/orders
 *  - WebhookController:  api/v1/webhooks/wechat-pay
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Order,
  Package,
  User,
  UserPackage,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { WebhookController } from './webhook.controller';
import { WechatPayService } from './wechat-pay.service';
import { BillingClient } from './billing.client';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [Order, Package, UserPackage, User],
      DATABASE_CONNECTIONS.MAIN,
    ),
  ],
  controllers: [OrderController, WebhookController],
  providers: [OrderService, WechatPayService, BillingClient],
  exports: [OrderService, WechatPayService, BillingClient],
})
export class OrderModule {}
