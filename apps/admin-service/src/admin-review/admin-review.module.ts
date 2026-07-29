/**
 * 审核工作台模块
 *
 * 聚合模板审核（template 库）与形象组授权审核（main 库）。
 *
 * 依赖：
 *  - DatabaseModule.forFeature([Template], 'template')  注入 template 库的 Template 仓储
 *  - DatabaseModule.forFeature([AvatarGroup], 'main')   注入 main 库的 AvatarGroup 仓储
 *  - ConfigModule（全局）                                提供 ConfigService（NOTIFICATION_SERVICE_URL / INTERNAL_API_KEY）
 *
 * 控制器：
 *  - AdminReviewController: /api/v1/admin/reviews/*
 *
 * 服务：
 *  - AdminReviewService: 审核聚合 + 通知推送
 */
import { Module } from '@nestjs/common'
import { DatabaseModule, DATABASE_CONNECTIONS, Template, AvatarGroup } from '@reelclone/database'
import { AdminReviewController } from './admin-review.controller'
import { AdminReviewService } from './admin-review.service'

@Module({
  imports: [
    // template 库实体（Template）
    DatabaseModule.forFeature([Template], DATABASE_CONNECTIONS.TEMPLATE),
    // main 库实体（AvatarGroup）
    DatabaseModule.forFeature([AvatarGroup], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [AdminReviewController],
  providers: [AdminReviewService],
  exports: [AdminReviewService],
})
export class AdminReviewModule {}
