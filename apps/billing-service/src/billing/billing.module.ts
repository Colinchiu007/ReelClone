/**
 * BillingModule — 计费业务模块
 *
 * 装配：
 *  - LedgerService（注入 main / billing DataSource）
 *  - BillingService（注入 Redis + LedgerService + DataSource）
 *  - BillingController
 *
 * 不在此处 forFeature 数据库实体（仓储通过 DataSource.getRepository 动态获取）。
 */
import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [BillingController],
  providers: [LedgerService, BillingService],
  exports: [BillingService, LedgerService],
})
export class BillingModule {}
