/**
 * Temporal 工作流重试策略集中配置
 *
 * P2-4: 将所有工作流级重试参数抽取到统一位置，避免散落在 client.ts / service.ts。
 *
 * 设计原则：
 *  1. 工作流级重试 maximumAttempts ≥ 2 — 允许基础设施故障（Temporal Server 重启、网络抖动）自动恢复
 *  2. 配置 nonRetryableErrorTypes — 业务终态错误（审核拒绝、Provider 取消未确认等）不应触发整个工作流重试
 *  3. 工作流内部的失败补偿逻辑（释放积分、标记 ANAlYSIS_FAILED）不变 — 重试仅覆盖工作流级异常
 */
import type { RetryPolicy } from '@temporalio/common'

// ============================================================
// 不可重试错误码（业务终态）
// ============================================================

/**
 * 工作流执行中出现以下错误码时，Temporal 不应自动重试整个工作流。
 *
 * 这些错误表示业务已到达确定的终态（如用户主动取消、审核拒绝），
 * 重试没有意义，反而可能导致重复计费或重复通知。
 */
export const NON_RETRYABLE_ERROR_TYPES = [
  'PROVIDER_CANCELLATION_PENDING',
  'MODERATION_REJECTED',
] as const

// ============================================================
// 工作流级重试配置
// ============================================================

/** 视频生成工作流重试策略 */
export const VIDEO_GENERATION_RETRY: RetryPolicy = {
  initialInterval: '10 seconds',
  maximumInterval: '1 minute',
  backoffCoefficient: 2,
  maximumAttempts: 2,
  nonRetryableErrorTypes: [...NON_RETRYABLE_ERROR_TYPES],
}

/** 对标解析工作流重试策略 */
export const BENCHMARK_ANALYSIS_RETRY: RetryPolicy = {
  initialInterval: '10 seconds',
  maximumInterval: '1 minute',
  backoffCoefficient: 2,
  maximumAttempts: 2,
  nonRetryableErrorTypes: [...NON_RETRYABLE_ERROR_TYPES],
}

/** 模板生成工作流重试策略 */
export const TEMPLATE_GENERATION_RETRY: RetryPolicy = {
  initialInterval: '10 seconds',
  maximumInterval: '1 minute',
  backoffCoefficient: 2,
  maximumAttempts: 2,
  nonRetryableErrorTypes: [...NON_RETRYABLE_ERROR_TYPES],
}

/** Reconciler 长运行工作流重试策略（单实例，不应自动重试整个工作流） */
export const RECONCILER_RETRY: RetryPolicy = {
  initialInterval: '10 seconds',
  maximumInterval: '5 minutes',
  backoffCoefficient: 2,
  maximumAttempts: 1,
}
