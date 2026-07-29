/**
 * WorkbenchModule — 工作台业务模块
 *
 * 装配：
 *  - BillingClient（注入 ConfigService，内部使用 axios）
 *  - GenerationService（注入 Redis + DataSource + BillingClient + TemporalService）
 *  - WorkService（注入 DataSource）
 *  - GenerationController / WorkController
 */
import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { WorkController } from './work.controller';
import { GenerationService } from './generation.service';
import { WorkService } from './work.service';
import { BillingClient } from './billing.client';

@Module({
  controllers: [GenerationController, WorkController],
  providers: [BillingClient, GenerationService, WorkService],
  exports: [GenerationService, WorkService, BillingClient],
})
export class WorkbenchModule {}
