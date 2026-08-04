/**
 * 分账业务模块
 *
 * 导入:
 *  - WechatPayAdapterModule：根据 profile 绑定 Mock/Real 微信支付适配器
 *  - main 库: ProfitSharingReceiver, ProfitSharingRecord, ProfitSharingItem 实体
 *
 * 提供:
 *  - ProfitSharingService: 分账核心服务（发起分账/回调/重试）
 *  - ProfitSharingReceiverService: 接收方 CRUD 管理
 *
 * 控制器:
 *  - ProfitSharingWebhookController:    api/v1/webhooks/wechat-pay-profit-sharing
 *  - ProfitSharingReceiverController:   api/v1/admin/profit-sharing/receivers
 *  - ProfitSharingRecordController:     api/v1/admin/profit-sharing/records
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WechatPayAdapterModule } from '@reelclone/adapters-wechat'
import {
  ProfitSharingReceiver,
  ProfitSharingRecord,
  ProfitSharingItem,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { ProfitSharingService } from './profit-sharing.service'
import { ProfitSharingReceiverService } from './profit-sharing-receiver.service'
import { ProfitSharingWebhookController } from './profit-sharing.controller'
import { ProfitSharingReceiverController } from './profit-sharing-receiver.controller'
import { ProfitSharingRecordController } from './profit-sharing-record.controller'

@Module({
  imports: [
    WechatPayAdapterModule,
    TypeOrmModule.forFeature(
      [ProfitSharingReceiver, ProfitSharingRecord, ProfitSharingItem],
      DATABASE_CONNECTIONS.MAIN,
    ),
  ],
  controllers: [
    ProfitSharingWebhookController,
    ProfitSharingReceiverController,
    ProfitSharingRecordController,
  ],
  providers: [ProfitSharingService, ProfitSharingReceiverService],
  exports: [ProfitSharingService, ProfitSharingReceiverService],
})
export class ProfitSharingModule {}
