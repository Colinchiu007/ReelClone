/**
 * 通知业务模块
 *
 * 组合：
 *  - DatabaseModule.forFeature([Notification], 'main')  注入 main 库的 Notification 仓储
 *  - NotificationController                              REST 端点（/api/v1/notifications）
 *  - NotificationGateway                                 WebSocket 网关（/ws）
 *  - NotificationService                                 业务逻辑
 *  - WechatSubscribeService                              微信订阅消息
 *  - EventSubscriber                                     Redis Pub/Sub 订阅器
 *
 * 依赖关系：
 *  - NotificationService → NotificationGateway（推送）
 *  - EventSubscriber     → NotificationService（创建并推送）
 *                        → NotificationGateway（直接推送 progress）
 *  - NotificationGateway → JwtService（来自 AuthModule，AppModule 中全局可用）
 */
import { Module } from '@nestjs/common'
import { DATABASE_CONNECTIONS, DatabaseModule, Notification } from '@reelclone/database'
import { AuthModule } from '../auth/auth.module'
import { EventSubscriber } from './event.subscriber'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { WechatSubscribeService } from './wechat-subscribe.service'
import { NotificationGateway } from './ws.gateway'

@Module({
  imports: [
    // main 库的 Notification 实体仓储
    DatabaseModule.forFeature([Notification], DATABASE_CONNECTIONS.MAIN),
    // 引入 AuthModule 以获得 JwtService（Gateway 依赖）
    AuthModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationGateway,
    NotificationService,
    WechatSubscribeService,
    EventSubscriber,
  ],
  exports: [NotificationService, NotificationGateway, WechatSubscribeService],
})
export class NotificationModule {}
