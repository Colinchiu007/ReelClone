/**
 * WorkbenchModule — 工作台业务模块
 *
 * 装配：
 *  - BillingClient（注入 ConfigService，内部使用 axios）
 *  - TemplateClient（注入 ConfigService，内部使用 axios）
 *  - GenerationService（注入 Redis + DataSource + BillingClient + TemplateClient + TemporalService）
 *  - WorkService（注入 DataSource + TemplateClient）
 *  - GenerationController / WorkController
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DATABASE_CONNECTIONS, GenerationTask, Work } from '@reelclone/database'
import { GenerationController } from './generation.controller'
import { WorkController } from './work.controller'
import { GenerationService } from './generation.service'
import { WorkService } from './work.service'
import { BillingClient } from './billing.client'
import { TemplateClient } from './template.client'

@Module({
  imports: [
    // 导出 main DataSource 供 GenerationService / WorkService 注入
    TypeOrmModule.forFeature([Work, GenerationTask], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [GenerationController, WorkController],
  providers: [BillingClient, TemplateClient, GenerationService, WorkService],
  exports: [GenerationService, WorkService, BillingClient, TemplateClient],
})
export class WorkbenchModule {}
