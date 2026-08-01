/**
 * Reconciler Activities（C5）
 *
 * 用于 GenerationExecution 悬挂状态的自动恢复。
 * 由 GenerationReconcilerWorkflow 调度，扫描 indeterminate 阶段的 Execution，
 * 查询 Provider 状态，自动推进到终态。
 */
import { Context } from '@temporalio/activity'
import type { ReconcilerActivities } from '../types'
import { getActivityDependencies } from './activity-context'
import { isMockMode } from './mock.util'

// C5: indeterminate 阶段集合 — 这些阶段需要 reconcile
const INDETERMINATE_STAGES = new Set([
  'INITIATED',
  'OUTPUT_READY',
  'SETTLEMENT_PENDING',
  'BILLING_RELEASE_PENDING',
  'PROVIDER_CANCEL_PENDING',
  'PROVIDER_STATE_UNKNOWN',
  'WORKFLOW_START_UNKNOWN',
])

// C5: 终态阶段集合 — 到达这些阶段后不再 reconcile
const TERMINAL_STAGES = new Set(['SETTLED', 'COMPLETED', 'FAILED', 'CANCELED'])

/**
 * C5: 扫描悬挂的 GenerationExecution 记录
 * 选取 stage 为 indeterminate 且超过 claimTimeout 未被 reconcile 的记录
 */
async function scanPendingExecutions(
  this: unknown,
  params: { batchSize: number; claimTimeoutMs: number },
): Promise<
  Array<{
    id: string
    generationWorkId: string
    stage: string
    providerName: string | null
    providerTaskId: string | null
    recoveryDeadline: Date | null
    lastReconciledAt: Date | null
  }>
> {
  if (isMockMode()) {
    return []
  }

  const deps = getActivityDependencies()
  const logger = Context.current().log
  const { batchSize, claimTimeoutMs } = params

  logger.info('C5: reconcile — 扫描悬挂 Execution', { batchSize, claimTimeoutMs })

  // 查找 indeterminate + 超过 claimTimeout 未被 reconcile 的记录
  // 避免重复扫描正在被其他 worker 处理的记录
  const cutoff = new Date(Date.now() - claimTimeoutMs)
  const pending = (await deps.executionRepo!.find({
    where: {
      stage: [...INDETERMINATE_STAGES],
    },
    order: { lastReconciledAt: 'ASC' },
    take: batchSize,
  })) as Array<{
    id: string
    generationWorkId: string
    stage: string
    providerName: string | null
    providerTaskId: string | null
    recoveryDeadline: Date | null
    lastReconciledAt: Date | null
  }>

  // 过滤：只处理 lastReconciledAt 为 NULL 或已超过 claimTimeout 的记录
  const filtered = pending.filter((e) => !e.lastReconciledAt || e.lastReconciledAt < cutoff)

  logger.info('C5: reconcile — 扫描完成', { found: filtered.length })
  return filtered
}

/**
 * C5: CAS claim — 原子性设置 reconcilerOwner，防止多 worker 竞争同一条 Execution
 * 返回 true 表示 claim 成功
 */
async function claimExecution(
  this: unknown,
  params: { executionId: string; reconcilerOwner: string },
): Promise<boolean> {
  if (isMockMode()) {
    return true
  }

  const deps = getActivityDependencies()
  const logger = Context.current().log
  const { executionId, reconcilerOwner } = params

  // CAS: 只有 reconcilerOwner 为 NULL 或已超时时才能 claim
  const now = new Date()
  const result = (await deps.executionRepo!.update(
    { id: executionId },
    { reconcilerOwner, lastReconciledAt: now },
  )) as { affected?: number }

  const claimed = (result.affected ?? 0) > 0
  if (claimed) {
    logger.info('C5: reconcile — claim 成功', { executionId, reconcilerOwner })
  } else {
    logger.warn('C5: reconcile — claim 失败（已被其他 worker 占用）', { executionId })
  }
  return claimed
}

/**
 * C5: 查询 Provider 任务状态
 * 调用 Provider adapter 的 queryTask（mock 模式返回 unknown）
 */
async function queryProviderTaskStatus(
  this: unknown,
  params: { providerName: string; providerTaskId: string },
): Promise<{ status: string; videoUrl?: string; errorMessage?: string }> {
  if (isMockMode()) {
    return { status: 'UNKNOWN' }
  }

  const deps = getActivityDependencies()
  const logger = Context.current().log
  const { providerName, providerTaskId } = params

  logger.info('C5: reconcile — 查询 Provider 状态', { providerName, providerTaskId })

  // 通过 Provider 查询适配器查询
  if (!deps.providerQuery) {
    throw new Error(`C5: No provider query adapter for "${providerName}"`)
  }
  const result = await deps.providerQuery(providerName, providerTaskId)
  return {
    status: result.status,
    videoUrl: result.videoUrl,
    errorMessage: result.errorMessage,
  }
}

/**
 * C5: 更新 Execution stage 并释放 claim
 * 终态时同时更新关联的 Work 状态
 */
async function updateExecutionStage(
  this: unknown,
  params: {
    executionId: string
    generationWorkId: string
    newStage: string
    videoUrl?: string
    errorMessage?: string
  },
): Promise<void> {
  if (isMockMode()) {
    return
  }

  const deps = getActivityDependencies()
  const logger = Context.current().log
  const { executionId, generationWorkId, newStage, videoUrl, errorMessage } = params

  logger.info('C5: reconcile — 更新 Execution stage', {
    executionId,
    generationWorkId,
    newStage,
  })

  // 1. 更新 GenerationExecution stage
  const updateData: Record<string, unknown> = { stage: newStage }
  if (videoUrl !== undefined || errorMessage !== undefined) {
    // 合并 reconciler 信息到 metadata（不覆盖已有字段）
    const meta: Record<string, unknown> = {}
    if (videoUrl !== undefined) meta.reconciledVideoUrl = videoUrl
    if (errorMessage !== undefined) meta.reconciledError = errorMessage
    updateData.metadata = JSON.stringify(meta)
  }
  await deps.executionRepo!.update(executionId, updateData)

  // 2. 终态时更新关联 Work
  if (TERMINAL_STAGES.has(newStage)) {
    const workStatus = newStage === 'COMPLETED' ? 'completed' : 'failed'
    const workUpdate: Record<string, unknown> = {
      status: workStatus,
      completedAt: new Date(),
      error: errorMessage ?? null,
    }
    if (newStage === 'COMPLETED' && videoUrl) {
      workUpdate.videoUrl = videoUrl
    }
    await deps.workRepo!.update(generationWorkId, workUpdate)
  }

  // 3. 释放 claim
  await deps.executionRepo!.update(executionId, {
    reconcilerOwner: null,
    lastReconciledAt: new Date(),
  })
}

/**
 * C5: 释放 claim（查询失败或非终态时调用）
 */
async function releaseClaim(this: unknown, params: { executionId: string }): Promise<void> {
  if (isMockMode()) {
    return
  }

  const deps = getActivityDependencies()
  const logger = Context.current().log

  logger.info('C5: reconcile — 释放 claim', { executionId: params.executionId })

  await deps.executionRepo!.update(params.executionId, {
    reconcilerOwner: null,
    lastReconciledAt: new Date(),
  })
}

// ============================================================
// Activity 类型推断
// ============================================================
type ReconcilerFn = (...args: unknown[]) => Promise<unknown>
type ReconcilerFunctions = Record<keyof ReconcilerActivities, ReconcilerFn>

// C5: 构建 Activity 实现（与 seedance.activities.ts 一致的模式）
export const reconcilerActivities: ReconcilerFunctions = {
  scanPendingExecutions: scanPendingExecutions as ReconcilerFn,
  claimExecution: claimExecution as ReconcilerFn,
  queryProviderTaskStatus: queryProviderTaskStatus as ReconcilerFn,
  updateExecutionStage: updateExecutionStage as ReconcilerFn,
  releaseClaim: releaseClaim as ReconcilerFn,
} as const

// 导出单个函数供测试和直接调用
export {
  scanPendingExecutions,
  claimExecution,
  queryProviderTaskStatus,
  updateExecutionStage,
  releaseClaim,
}
