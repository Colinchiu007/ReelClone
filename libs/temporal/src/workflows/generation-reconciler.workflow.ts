/**
 * GenerationExecution Reconciler Workflow（C5）
 *
 * 定期扫描悬挂的 GenerationExecution 记录（indeterminate 阶段），
 * 查询 Provider 任务状态，自动推进到终态。
 *
 * 设计为长运行工作流：循环扫描 → 处理 → sleep → 重复。
 * 通过 temporalService.startGenerationReconciler() 启动单实例。
 */
import { proxyActivities, sleep } from '@temporalio/workflow'
import type { GenerationReconcilerParams, ReconcilerActivities } from '../types'
import { RECONCILER_CONFIG as DEFAULT_CONFIG } from '../types'

// 仅引入类型，实际实现由 Worker 注册
type AllActivities = ReconcilerActivities

/**
 * C5: GenerationExecution Reconciler 工作流
 *
 * 持续运行直到被取消，定期扫描并修复悬挂状态。
 *
 * @param params 重建参数（扫描间隔 / 批次大小）
 * @returns 每轮扫描的处理结果摘要
 */
export async function generationReconcilerWorkflow(
  params: GenerationReconcilerParams = {},
): Promise<{ scanned: number; reconciled: number; rounds: number }> {
  const activities = proxyActivities<AllActivities>({
    startToCloseTimeout: '2 minutes',
    retry: {
      initialInterval: '5 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  })

  const intervalMs = params.intervalMs ?? DEFAULT_CONFIG.DEFAULT_INTERVAL_MS
  const batchSize = params.batchSize ?? DEFAULT_CONFIG.MAX_BATCH_SIZE
  const reconcilerOwner = `reconciler-${Date.now()}`
  let _totalScanned = 0
  let _totalReconciled = 0
  let rounds = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    rounds++

    try {
      // 1. 扫描悬挂的 Execution
      const pending = await activities.scanPendingExecutions({
        batchSize,
        claimTimeoutMs: DEFAULT_CONFIG.CLAIM_TIMEOUT_MS,
      })

      _totalScanned += pending.length

      if (pending.length === 0) {
        // 无待处理，直接 sleep
        await sleep(intervalMs)
        continue
      }

      // 2. 逐条处理（扇出模式：每条独立 claim → 查询 → 更新）
      for (const execution of pending) {
        try {
          // 2a. CAS claim
          const claimed = await activities.claimExecution({
            executionId: execution.id,
            reconcilerOwner,
          })

          if (!claimed) {
            // 被其他 worker 占用，跳过
            continue
          }

          // 2b. 查询 Provider 状态
          if (!execution.providerName || !execution.providerTaskId) {
            // 无 Provider 信息，释放 claim 并跳过
            await activities.releaseClaim({ executionId: execution.id })
            continue
          }

          const providerResult = await activities.queryProviderTaskStatus({
            providerName: execution.providerName,
            providerTaskId: execution.providerTaskId,
          })

          // 2c. 根据 Provider 状态决定下一步
          const stageMap: Record<string, string> = {
            COMPLETED: 'COMPLETED',
            FAILED: 'FAILED',
            CANCELED: 'CANCELED',
            SUBMITTED: 'OUTPUT_READY',
            RUNNING: 'OUTPUT_READY',
            UNKNOWN: 'PROVIDER_STATE_UNKNOWN',
          }

          const newStage = stageMap[providerResult.status]

          if (newStage && isTerminalStage(newStage)) {
            // 终态：更新 Execution + Work
            await activities.updateExecutionStage({
              executionId: execution.id,
              generationWorkId: execution.generationWorkId,
              newStage,
              videoUrl: providerResult.videoUrl,
              errorMessage: providerResult.errorMessage,
            })
            _totalReconciled++
          } else if (newStage) {
            // 非终态：更新 stage + 释放 claim
            await activities.updateExecutionStage({
              executionId: execution.id,
              generationWorkId: execution.generationWorkId,
              newStage,
            })
          } else {
            // 未知 Provider 状态：释放 claim
            await activities.releaseClaim({ executionId: execution.id })
          }
        } catch (err) {
          // 单条失败不影响其他：释放 claim + 继续
          try {
            await activities.releaseClaim({ executionId: execution.id })
          } catch {
            // 释放失败也忽略，靠 claimTimeout 自动过期
          }
        }
      }
    } catch (err) {
      // 轮次级别异常：log + 继续下一轮
      // eslint-disable-next-line no-console
      console.error('[ReconcilerWorkflow] 轮次异常，等待下一轮', {
        round: rounds,
        error: String(err),
      })
    }

    // 等待下一轮扫描
    await sleep(intervalMs)
  }
}

/** 判断 stage 是否为终态 */
function isTerminalStage(stage: string): boolean {
  return ['COMPLETED', 'FAILED', 'CANCELED', 'SETTLED'].includes(stage)
}
