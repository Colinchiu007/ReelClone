/**
 * AdminNotificationModule — 通知推送模块
 *
 * 注册 main 库的 User 实体仓储（用于广播时定位目标用户）。
 *
 * 提供：
 *  - AdminNotificationService: 广播公告 + 定向推送（通过 HTTP 调用 notification-service）
 *  - AdminNotificationController: api/v1/admin/notifications
 *
 * 注意：此模块需在 app.module.ts 中统一注册（后续步骤完成）。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DATABASE_CONNECTIONS, User } from '@reelclone/database'
import { AdminNotificationController } from './admin-notification.controller'
import { AdminNotificationService } from './admin-notification.service'

@Module({
  imports: [
    // main 库：用户（广播时定位目标用户）
    TypeOrmModule.forFeature([User], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [AdminNotificationController],
  providers: [AdminNotificationService],
  exports: [AdminNotificationService],
})
export class AdminNotificationModule {}
