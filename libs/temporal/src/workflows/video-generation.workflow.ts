/**
 * 视频生成工作流
 *
 * 编排视频生成的完整异步流程：
 * 1. 提交任务到 Seedance Provider
 * 2. 轮询任务状态（每 5 秒，最多 120 次 = 10 分钟）
 * 3. 成功：下载视频 → FFmpeg 后处理 → 内容安全审核 → 结算积分 → 更新状态 → 通知用户
 * 4. 失败：释放积分 → 更新状态 → 通知用户
 * 5. 超时：取消 Seedance 任务 → 释放积分 → 更新状态 → 通知用户
 *
 * 幂等键贯穿所有计费操作，保证 Exactly-Once 语义。
 */
import { CancellationScope, isCancellation, proxyActivities, sleep } from '@temporalio/workflow'
import type {
  BillingActivities,
  MediaActivities,
  NotificationActivities,
  OssActivities,
  SeedanceActivities,
  VideoGenParams,
  VideoGenResult,
} from '../types'
import {
  NotificationType,
  SeedanceTaskStatus,
  VIDEO_POLLING_CONFIG,
  WorkStatus as WS,
} from '../types'

/**
 * 获取工作流确定性时间戳。
 *
 * Temporal TypeScript SDK 会拦截 Date.now() 并返回工作流上下文的
 * 确定性时间，因此在此处直接使用 Date.now() 是安全的。
 * 参考: https://docs.temporal.io/dev/typescript/determinism
 */
function workflowNow(): number {
  return Date.now()
}

/**
 * 获取 ISO 格式时间戳（确定性）。
 * new Date().toISOString() 同样被 Temporal SDK 拦截。
 */
function workflowISOTime(): string {
  return new Date(workflowNow()).toISOString()
}

/** Provider 尚未确认取消时，不能把预留释放给用户。 */
class ProviderCancellationPendingError extends Error {}

/** 提交回执或轮询状态不确定时，不能推断 Provider 没有继续生成。 */
class ProviderStateUnknownError extends Error {}

// 仅引入类型，实际实现由 Worker 注册
type AllActivities = SeedanceActivities &
  BillingActivities &
  MediaActivities &
  NotificationActivities &
  OssActivities

/**
 * 视频生成工作流入口
 *
 * @param params 视频生成参数（含 workId / userId / 提示词 / 模型配置 / 幂等键）
 * @returns 生成结果（成品 URL / 状态 / 消耗积分）
 */
export async function videoGenerationWorkflow(params: VideoGenParams): Promise<VideoGenResult> {
  // Activity 代理配置：统一的重试策略与超时
  // 注意：proxyActivities 必须在 workflow 函数内部调用，不能在模块顶层调用
  const activities = proxyActivities<AllActivities>({
    startToCloseTimeout: '5 minutes',
    retry: {
      initialInterval: '1 second',
      maximumInterval: '30 seconds',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
  })

  const startedAt = Date.now()
  const { workId } = params

  let result: VideoGenResult = {
    workId,
    status: WS.FAILED,
    consumedCredits: 0,
    durationMs: 0,
  }

  let seedanceTaskId: string | undefined
  // submit 可能已被 Provider 接收但客户端未收到 taskId；在明确终态前任何异常都必须 fail closed。
  let submissionAttempted = false
  let providerTerminal = false

  try {
    // ---- 步骤 1：更新状态为处理中 ----
    await activities.updateWorkStatus(
      workId,
      WS.PROCESSING,
      { stage: 'submitting' },
      params.generationTaskId,
    )

    // ---- 步骤 2：提交任务到 Seedance ----
    submissionAttempted = true
    seedanceTaskId = await activities.submitToSeedance(params)
    result.providerTaskId = seedanceTaskId
    await activities.updateWorkStatus(
      workId,
      WS.PROCESSING,
      { stage: 'polling', providerTaskId: seedanceTaskId },
      params.generationTaskId,
    )

    // ---- 步骤 3：轮询任务状态 ----
    let finalStatus: SeedanceTaskStatus = SeedanceTaskStatus.UNKNOWN
    let videoUrl: string | undefined

    for (let attempt = 1; attempt <= VIDEO_POLLING_CONFIG.MAX_ATTEMPTS; attempt++) {
      await sleep(VIDEO_POLLING_CONFIG.INTERVAL_MS)
      const queryResult = await activities.querySeedanceTask(seedanceTaskId)

      if (queryResult.status === SeedanceTaskStatus.COMPLETED) {
        finalStatus = SeedanceTaskStatus.COMPLETED
        videoUrl = queryResult.videoUrl
        providerTerminal = true
        break
      }

      if (queryResult.status === SeedanceTaskStatus.FAILED) {
        finalStatus = SeedanceTaskStatus.FAILED
        result.error = queryResult.errorMessage ?? 'Seedance 任务失败'
        providerTerminal = true
        break
      }

      if (queryResult.status === SeedanceTaskStatus.CANCELED) {
        finalStatus = SeedanceTaskStatus.CANCELED
        result.error = 'Seedance 任务被取消'
        providerTerminal = true
        break
      }
      // RUNNING / SUBMITTED：继续轮询
    }

    // ---- 步骤 4：根据最终状态分流处理 ----
    if (finalStatus === SeedanceTaskStatus.COMPLETED && videoUrl) {
      // 成功路径
      result = await handleSuccess(params, videoUrl, startedAt, activities)
    } else if (finalStatus === SeedanceTaskStatus.FAILED) {
      // 失败路径
      result = await handleFailure(
        params,
        result.error ?? '任务失败',
        startedAt,
        seedanceTaskId,
        activities,
      )
    } else if (finalStatus === SeedanceTaskStatus.CANCELED) {
      // Provider 已确认取消，按取消语义释放预留而非标记为超时。
      await handleCancellation(params, seedanceTaskId, activities, true)
      result = {
        workId,
        status: WS.CANCELED,
        consumedCredits: 0,
        error: result.error ?? 'Seedance 任务被取消',
        providerTaskId: seedanceTaskId,
        durationMs: workflowNow() - startedAt,
      }
    } else {
      // 超时路径（轮询用尽或未知状态）
      result = await handleTimeout(params, seedanceTaskId, startedAt, activities)
    }
  } catch (err) {
    if (isCancellation(err)) {
      await CancellationScope.nonCancellable(async () => {
        try {
          await handleCancellation(params, seedanceTaskId, activities, false, submissionAttempted)
        } catch (cancellationErr) {
          if (
            cancellationErr instanceof ProviderCancellationPendingError ||
            cancellationErr instanceof ProviderStateUnknownError
          ) {
            await markProviderPending(
              params,
              seedanceTaskId,
              cancellationErr instanceof Error ? cancellationErr.message : String(cancellationErr),
              cancellationErr instanceof ProviderStateUnknownError
                ? 'provider_state_unknown'
                : 'provider_cancel_pending',
              activities,
            )
            return
          }
          throw cancellationErr
        }
      })
      throw err
    }
    if (err instanceof ProviderCancellationPendingError) {
      await markProviderPending(
        params,
        seedanceTaskId,
        err.message,
        'provider_cancel_pending',
        activities,
      )
      throw err
    }
    if (err instanceof ProviderStateUnknownError) {
      await markProviderPending(
        params,
        seedanceTaskId,
        err.message,
        'provider_state_unknown',
        activities,
      )
      throw err
    }
    if (submissionAttempted && !providerTerminal) {
      result = await handleUncertainProviderFailure(
        params,
        err instanceof Error ? err.message : String(err),
        startedAt,
        seedanceTaskId,
        activities,
      )
      result.durationMs = workflowNow() - startedAt
      return result
    }
    // 工作流级异常兜底
    result = await handleFailure(
      params,
      err instanceof Error ? err.message : String(err),
      startedAt,
      seedanceTaskId,
      activities,
    )
  }

  result.durationMs = workflowNow() - startedAt
  return result
}

// ============================================================
// 成功路径：下载 → 后处理 → 审核 → 结算 → 通知
// ============================================================
async function handleSuccess(
  params: VideoGenParams,
  videoUrl: string,
  startedAt: number,
  activities: AllActivities,
): Promise<VideoGenResult> {
  const { workId, userId, billingReservation, estimatedCredits, enableModeration } = params

  // 1. FFmpeg 后处理（内部会下载源视频并上传成品到 OSS）
  const resultKey = await activities.postProcessVideo(videoUrl, {
    codec: 'h264',
    resolution: params.modelConfig.resolution,
    format: 'mp4',
  })

  // 2. 生成封面缩略图
  const thumbnailKey = await activities.generateThumbnail(resultKey)

  // 3. 内容安全审核（可选）
  if (enableModeration) {
    const moderation = await activities.moderateContent(resultKey, thumbnailKey)
    if (!moderation.passed) {
      // 审核未通过：走失败退款流程
      await activities.releaseCredits(userId, workId, billingReservation)
      await activities.updateWorkStatus(
        workId,
        WS.FAILED,
        {
          stage: 'moderation_rejected',
          reason: moderation.reason,
          labels: moderation.labels,
        },
        params.generationTaskId,
      )
      await activities.notifyUser(userId, NotificationType.WORK_FAILED, {
        workId,
        reason: `内容审核未通过：${moderation.reason ?? '未提供原因'}`,
      })
      return {
        workId,
        status: WS.FAILED,
        consumedCredits: 0,
        error: `内容审核未通过：${moderation.reason}`,
        durationMs: workflowNow() - startedAt,
      }
    }
  }

  // 4. 生成成品签名 URL
  const signedResultUrl = await activities.generateSignedUrl(resultKey)
  const signedCoverUrl = await activities.generateSignedUrl(thumbnailKey)

  // 5. 结算积分（按实际用量；此处简化为预估全量结算）
  await activities.settleCredits(userId, workId, billingReservation)

  // 6. 更新 Work 状态为已完成
  await activities.updateWorkStatus(
    workId,
    WS.COMPLETED,
    {
      stage: 'completed',
      resultUrl: signedResultUrl,
      resultKey,
      coverUrl: signedCoverUrl,
      coverKey: thumbnailKey,
      consumedPoints: estimatedCredits,
      completedAt: workflowISOTime(),
    },
    params.generationTaskId,
  )

  // 7. 通知用户
  await activities.notifyUser(userId, NotificationType.WORK_COMPLETED, {
    workId,
    resultUrl: signedResultUrl,
    coverUrl: signedCoverUrl,
    consumedCredits: estimatedCredits,
  })

  return {
    workId,
    status: WS.COMPLETED,
    resultUrl: signedResultUrl,
    resultKey,
    coverUrl: signedCoverUrl,
    consumedCredits: estimatedCredits,
    durationMs: Date.now() - startedAt,
  }
}

// ============================================================
// 失败路径：释放积分 → 更新状态 → 通知
// ============================================================
async function handleFailure(
  params: VideoGenParams,
  errorMessage: string,
  startedAt: number,
  seedanceTaskId: string | undefined,
  activities: AllActivities,
): Promise<VideoGenResult> {
  const { workId, userId, billingReservation } = params

  // 1. 释放冻结积分（幂等）
  await activities.releaseCredits(userId, workId, billingReservation)

  // 2. 更新 Work 状态为失败
  await activities.updateWorkStatus(
    workId,
    WS.FAILED,
    {
      stage: 'failed',
      error: errorMessage,
      providerTaskId: seedanceTaskId,
      failedAt: workflowISOTime(),
    },
    params.generationTaskId,
  )

  // 3. 通知用户
  await activities.notifyUser(userId, NotificationType.WORK_FAILED, {
    workId,
    reason: errorMessage,
  })

  return {
    workId,
    status: WS.FAILED,
    consumedCredits: 0,
    error: errorMessage,
    providerTaskId: seedanceTaskId,
    durationMs: Date.now() - startedAt,
  }
}

// ============================================================
// 超时路径：取消任务 → 释放积分 → 更新状态 → 通知
// ============================================================
async function handleTimeout(
  params: VideoGenParams,
  seedanceTaskId: string | undefined,
  startedAt: number,
  activities: AllActivities,
): Promise<VideoGenResult> {
  const { workId, userId, billingReservation } = params

  // 1. 取消 Seedance 任务（若已提交）
  if (seedanceTaskId) {
    try {
      const canceled = await activities.cancelSeedanceTask(seedanceTaskId)
      if (!canceled) {
        throw new Error('Provider 未确认取消')
      }
    } catch (err) {
      console.error('[VideoGen] 取消 Seedance 任务失败', err)
      throw new ProviderCancellationPendingError(
        `Provider 取消未确认，保留积分预留: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // 2. 释放冻结积分（幂等）
  await activities.releaseCredits(userId, workId, billingReservation)

  // 3. 更新 Work 状态为超时
  await activities.updateWorkStatus(
    workId,
    WS.TIMEOUT,
    {
      stage: 'timeout',
      providerTaskId: seedanceTaskId,
      timedOutAt: workflowISOTime(),
    },
    params.generationTaskId,
  )

  // 4. 通知用户
  await activities.notifyUser(userId, NotificationType.WORK_TIMEOUT, {
    workId,
    reason: '视频生成超时（超过 10 分钟）',
  })

  return {
    workId,
    status: WS.TIMEOUT,
    consumedCredits: 0,
    error: '视频生成超时',
    providerTaskId: seedanceTaskId,
    durationMs: Date.now() - startedAt,
  }
}

/**
 * Provider 仍可能执行时的 fail-closed 路径。
 *
 * 有 taskId 时只有活动确认取消后才释放预留；没有 taskId 时无法安全取消，保留预留等待
 * 以 idempotencyKey / 人工对账恢复。该方法不发失败通知，避免向用户错误宣告任务结束。
 */
async function handleUncertainProviderFailure(
  params: VideoGenParams,
  errorMessage: string,
  startedAt: number,
  seedanceTaskId: string | undefined,
  activities: AllActivities,
): Promise<VideoGenResult> {
  if (!seedanceTaskId) {
    await markProviderPending(params, undefined, errorMessage, 'provider_state_unknown', activities)
    throw new ProviderStateUnknownError(`Provider 提交状态未确认，保留积分预留: ${errorMessage}`)
  }

  try {
    const canceled = await activities.cancelSeedanceTask(seedanceTaskId)
    if (!canceled) {
      throw new ProviderCancellationPendingError('Provider 未确认取消，保留积分预留')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markProviderPending(
      params,
      seedanceTaskId,
      message,
      'provider_cancel_pending',
      activities,
    )
    throw new ProviderCancellationPendingError(`Provider 取消未确认，保留积分预留: ${message}`)
  }

  return handleFailure(params, errorMessage, startedAt, seedanceTaskId, activities)
}

/** 在等待外部状态恢复期间持久化诊断，但不改变生成中的状态或账务预留。 */
async function markProviderPending(
  params: VideoGenParams,
  seedanceTaskId: string | undefined,
  errorMessage: string,
  stage: 'provider_state_unknown' | 'provider_cancel_pending',
  activities: AllActivities,
): Promise<void> {
  await activities.updateWorkStatus(
    params.workId,
    WS.PROCESSING,
    {
      stage,
      error: errorMessage,
      providerTaskId: seedanceTaskId,
    },
    params.generationTaskId,
  )
}

// ============================================================
// 取消路径：在不可取消 scope 中补偿，再将取消异常交还给 Temporal
// ============================================================
async function handleCancellation(
  params: VideoGenParams,
  seedanceTaskId: string | undefined,
  activities: AllActivities,
  providerAlreadyCanceled = false,
  submissionAttempted = false,
): Promise<void> {
  const { workId, userId, billingReservation, generationTaskId } = params

  if (!seedanceTaskId && submissionAttempted) {
    throw new ProviderStateUnknownError('Provider 提交状态未确认，保留积分预留')
  }

  if (seedanceTaskId && !providerAlreadyCanceled) {
    const canceled = await activities.cancelSeedanceTask(seedanceTaskId)
    if (!canceled) {
      throw new ProviderCancellationPendingError('Provider 未确认取消，保留积分预留')
    }
  }

  await activities.releaseCredits(userId, workId, billingReservation)
  await activities.updateWorkStatus(
    workId,
    WS.CANCELED,
    {
      stage: 'canceled',
      providerTaskId: seedanceTaskId,
      reason: '任务已取消',
    },
    generationTaskId,
  )
  await activities.notifyUser(userId, NotificationType.WORK_FAILED, {
    workId,
    reason: '任务已取消',
  })
}
