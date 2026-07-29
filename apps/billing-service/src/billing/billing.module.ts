/**
 * BillingModule — 计费业务模块
 *
 * 装配：
 *  - ScheduleModule：定时任务（对账 cron）
 *  - LedgerService（注入 main / billing DataSource）
 *  - BillingService（注入 Redis + LedgerService + DataSource）
 *  - ReconciliationService（注入 main / billing DataSource + LedgerService）
 *  - ReconciliationCron（注入 ReconciliationService）
 *  - BillingController
 *
 * 不在此处 forFeature 数据库实体（仓储通过 DataSource.getRepository 动态获取）。
 */
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { LedgerService } from './ledger.service'
import { ReconciliationCron } from './reconciliation.cron'
import { ReconciliationService } from './reconciliation.service'

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [BillingController],
  providers: [LedgerService, BillingService, ReconciliationService, ReconciliationCron],
  exports: [BillingService, LedgerService, ReconciliationService],
})
export class BillingModule {}
