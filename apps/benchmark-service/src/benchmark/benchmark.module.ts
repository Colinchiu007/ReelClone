/**
 * BenchmarkModule — 对标解析业务模块
 *
 * 装配：
 *  - AiModule：提供 PromptEngineService（生成复刻提示词）
 *  - ConfigStoreModule：提供运行时 API Key 热刷新（SeedanceProvider / LlmProvider）
 *  - BillingClient：调用 billing-service 内部 API（freeze / release）
 *  - TemporalAdapter：封装 Temporal 工作流调用（startBenchmarkAnalysis / cancelWorkflow）
 *  - BenchmarkService：业务编排（注入 Redis + benchmark DataSource + BillingClient + TemporalAdapter + PromptEngineService）
 *  - BenchmarkController：API 端点
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AiModule } from '@reelclone/ai'
import { ConfigStoreModule } from '@reelclone/common'
import { Benchmark, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BillingClient } from './billing-client'
import { TemporalAdapter } from './temporal-adapter'
import { BenchmarkController } from './benchmark.controller'
import { BenchmarkService } from './benchmark.service'

@Module({
  imports: [
    AiModule,
    ConfigStoreModule,
    // 导出 benchmark DataSource 供 BenchmarkService 注入
    TypeOrmModule.forFeature([Benchmark], DATABASE_CONNECTIONS.BENCHMARK),
  ],
  controllers: [BenchmarkController],
  providers: [BillingClient, TemporalAdapter, BenchmarkService],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}
