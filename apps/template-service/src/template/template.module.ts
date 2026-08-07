/**
 * 模板业务模块
 *
 * 导入:
 *  - template 库: Template, Favorite 实体
 *  - main 库:     User 实体（仅用于读取/更新 industryPreferences）
 *                Asset 实体（用户上传视频转模板时校验资产归属与时长）
 *
 * 提供:
 *  - TemplateService:  模板列表/详情 + 用户上传视频转模板 + 积分奖励触发
 *  - FavoriteService:  收藏/取消收藏/收藏列表
 *  - IndustryService:  用户行业偏好读写（main 库 user.industryPreferences）
 *  - BillingClient:    调用 billing-service /api/v1/points/reward（积分奖励）
 *
 * 控制器:
 *  - TemplateController: api/v1/templates
 *  - IndustryController: api/v1/users/industry-preferences
 */
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Asset, Template, Favorite, User, DATABASE_CONNECTIONS } from '@reelclone/database'
import { TemplateService } from './template.service'
import { FavoriteService } from './favorite.service'
import { TemplateController } from './template.controller'
import { IndustryController } from './industry.controller'
import { IndustryService } from './industry.service'
import { BillingClient } from './billing.client'
import { RewardReconciliationService } from './reward-reconciliation.service'
import { RewardReconciliationCron } from './reward-reconciliation.cron'
import { UploadReconciliationService } from './upload-reconciliation.service'
import { UploadReconciliationCron } from './upload-reconciliation.cron'

@Module({
  imports: [
    // 定时任务（奖励漏发补发对账 + ANALYZING 超时对账）
    ScheduleModule.forRoot(),
    // template 库实体
    TypeOrmModule.forFeature([Template, Favorite], DATABASE_CONNECTIONS.TEMPLATE),
    // main 库实体（User: 行业偏好读写；Asset: 上传视频转模板时校验资产归属）
    TypeOrmModule.forFeature([User, Asset], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [TemplateController, IndustryController],
  providers: [
    TemplateService,
    FavoriteService,
    IndustryService,
    BillingClient,
    RewardReconciliationService,
    RewardReconciliationCron,
    UploadReconciliationService,
    UploadReconciliationCron,
  ],
  exports: [TemplateService, FavoriteService],
})
export class TemplateModule {}
