/**
 * 对标解析工作流
 *
 * 编排对标视频的解析流程：
 * 1. 下载对标视频
 * 2. 并行执行 4 维度分析（场景切分 / ASR / OCR / VLM）
 *    —— analyzeVideo Activity 内部并行调用 4 个分析器
 * 3. LLM 汇总为结构化报告
 * 4. 更新 Benchmark 状态 → 通知用户
 */
import { proxyActivities } from '@temporalio/workflow'
import type {
  AnalyzerActivities,
  BenchmarkParams,
  BenchmarkResult,
  NotificationActivities,
} from '../types'
import { BenchmarkStatus as BS, NotificationType } from '../types'

// 仅引入类型，实际实现由 Worker 注册
type AllActivities = AnalyzerActivities & NotificationActivities

/**
 * 对标解析工作流入口
 *
 * @param params 对标解析参数（含 benchmarkId / sourceUrl / platform / 幂等键）
 * @returns 解析结果（结构化报告 / 状态）
 */
export async function benchmarkAnalysisWorkflow(
  params: BenchmarkParams,
): Promise<BenchmarkResult> {
  // 注意：proxyActivities 必须在 workflow 函数内部调用，不能在模块顶层调用
  const activities = proxyActivities<AllActivities>({
    // 分析耗时较长，放宽 startToCloseTimeout
    startToCloseTimeout: '10 minutes',
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 2,
    },
  })

  const startedAt = Date.now()
  const { benchmarkId, userId, sourceUrl, platform } = params

  let result: BenchmarkResult = {
    benchmarkId,
    status: BS.FAILED,
    consumedCredits: 0,
    durationMs: 0,
  }

  try {
    // ---- 步骤 1：更新状态为分析中 ----
    await activities.updateBenchmarkStatus(benchmarkId, BS.ANALYZING, { stage: 'downloading' })

    // ---- 步骤 2：下载对标视频 ----
    const localPath = await activities.downloadBenchmarkVideo(sourceUrl)
    await activities.updateBenchmarkStatus(benchmarkId, BS.ANALYZING, {
      stage: 'analyzing',
      localPath,
      platform,
    })

    // ---- 步骤 3：视频分析（内部并行 4 维度） ----
    const analysisReport = await activities.analyzeVideo(localPath)

    // ---- 步骤 4：LLM 汇总为结构化报告 ----
    await activities.updateBenchmarkStatus(benchmarkId, BS.ANALYZING, { stage: 'summarizing' })
    const structuredReport = await activities.summarizeReport(analysisReport)

    // ---- 步骤 5：更新状态为已完成 ----
    await activities.updateBenchmarkStatus(benchmarkId, BS.COMPLETED, {
      stage: 'completed',
      analysisResult: structuredReport,
      completedAt: new Date().toISOString(),
    })

    // ---- 步骤 6：通知用户 ----
    await activities.notifyUser(userId, NotificationType.BENCHMARK_COMPLETED, {
      benchmarkId,
      platform,
      reportSummary: {
        style: structuredReport.style,
        shotCount: structuredReport.shotList.length,
        sellingPoints: structuredReport.sellingPoints,
      },
    })

    result = {
      benchmarkId,
      status: BS.COMPLETED,
      analysisReport,
      structuredReport,
      consumedCredits: 1, // 对标解析固定消耗 1 积分（业务侧可调整）
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    // 失败：更新状态 + 通知用户
    await activities.updateBenchmarkStatus(benchmarkId, BS.FAILED, {
      stage: 'failed',
      error: errorMessage,
      failedAt: new Date().toISOString(),
    })
    await activities.notifyUser(userId, NotificationType.BENCHMARK_FAILED, {
      benchmarkId,
      reason: errorMessage,
    })

    result = {
      benchmarkId,
      status: BS.FAILED,
      consumedCredits: 0,
      error: errorMessage,
      durationMs: Date.now() - startedAt,
    }
  }

  result.durationMs = Date.now() - startedAt
  return result
}
