/**
 * TemporalAdapter — Temporal 工作流调用适配器
 *
 * 包装 @reelclone/temporal 的工作流启动/取消函数，
 * 使用 require() 动态加载以避免 tsc 对 temporal 源码进行类型检查
 * （temporal 库依赖 @temporalio/* 包，其类型声明可能因版本差异产生编译错误）。
 *
 * 通过 NestJS DI 注入，便于单元测试时 mock。
 */
import { Injectable, Logger } from '@nestjs/common';

/**
 * 对标解析工作流参数
 *
 * B4 重构：新增 billingReservation，使 benchmark 走 V2 CreditReservation 路径。
 * workflow 成功时 settle，失败/取消时 release。
 */
export interface BenchmarkWorkflowParams {
  benchmarkId: string;
  userId: string;
  sourceUrl: string;
  platform: string;
  /** V2 账务预留信息（成功时 settle，失败时 release） */
  billingReservation?: {
    freezeId: string;
    amount: number;
    billingMode?: 'v2' | 'legacy';
    settleIdempotencyKey: string;
    releaseIdempotencyKey: string;
  };
}

@Injectable()
export class TemporalAdapter {
  private readonly logger = new Logger(TemporalAdapter.name);

  /**
   * 启动对标解析工作流
   * @returns 工作流 ID
   */
  async startBenchmarkAnalysis(
    params: BenchmarkWorkflowParams,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { startBenchmarkAnalysisWorkflow } = require('@reelclone/temporal') as {
      startBenchmarkAnalysisWorkflow: (p: BenchmarkWorkflowParams) => Promise<string>;
    };
    const workflowId = await startBenchmarkAnalysisWorkflow(params);
    this.logger.log(
      `Temporal 工作流已启动 workflowId=${workflowId} benchmarkId=${params.benchmarkId}`,
    );
    return workflowId;
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cancelWorkflow } = require('@reelclone/temporal') as {
      cancelWorkflow: (id: string, r?: string) => Promise<void>;
    };
    await cancelWorkflow(workflowId, reason);
    this.logger.log(`Temporal 工作流已取消 workflowId=${workflowId}`);
  }
}
