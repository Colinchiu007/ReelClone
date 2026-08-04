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
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  BillingProjectionOutbox,
  CreditOperation,
  CreditOperationOutbox,
  CreditReservation,
  DATABASE_CONNECTIONS,
  PointTransaction,
  User,
} from '@reelclone/database'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { LedgerService } from './ledger.service'
import { ReconciliationCron } from './reconciliation.cron'
import { ReconciliationService } from './reconciliation.service'
import { CreditReservationService } from './credit-reservation.service'
import { BillingProjectionCron } from './billing-projection.cron'
import { HistoricalDataInventoryService } from './historical-data-inventory.service'
import { PackageExpiryService } from './package-expiry.service'
import { PackageExpiryCron } from './package-expiry.cron'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // 导出 main / billing DataSource 供 LedgerService / BillingService / ReconciliationService 注入
    TypeOrmModule.forFeature(
      [User, CreditReservation, BillingProjectionOutbox, CreditOperation, CreditOperationOutbox],
      DATABASE_CONNECTIONS.MAIN,
    ),
    TypeOrmModule.forFeature([PointTransaction], DATABASE_CONNECTIONS.BILLING),
  ],
  controllers: [BillingController],
  providers: [
    LedgerService,
    CreditReservationService,
    BillingService,
    ReconciliationService,
    ReconciliationCron,
    BillingProjectionCron,
    HistoricalDataInventoryService,
    PackageExpiryService,
    PackageExpiryCron,
  ],
  exports: [BillingService, LedgerService, CreditReservationService, ReconciliationService, HistoricalDataInventoryService],
})
export class BillingModule {}
