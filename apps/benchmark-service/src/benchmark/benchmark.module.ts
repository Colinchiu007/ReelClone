/**
 * BenchmarkModule — 对标解析业务模块
 *
 * 装配：
 *  - BillingClient：调用 billing-service 内部 API（freeze / release）
 *  - TemporalAdapter：封装 Temporal 工作流调用（startBenchmarkAnalysis / cancelWorkflow）
 *  - BenchmarkService：业务编排（注入 Redis + benchmark DataSource + BillingClient + TemporalAdapter）
 *  - BenchmarkController：API 端点
 */
import { Module } from '@nestjs/common';
import { BillingClient } from './billing-client';
import { TemporalAdapter } from './temporal-adapter';
import { BenchmarkController } from './benchmark.controller';
import { BenchmarkService } from './benchmark.service';

@Module({
  controllers: [BenchmarkController],
  providers: [BillingClient, TemporalAdapter, BenchmarkService],
  exports: [BenchmarkService],
})
export class BenchmarkModule {}
