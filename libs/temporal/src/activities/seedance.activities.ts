/**
 * Seedance 视频 AI Activity
 *
 * 封装与火山 Seedance Provider 的交互：
 * - 提交视频生成任务
 * - 轮询任务状态
 * - 取消任务
 *
 * Mock 模式：返回模拟的 taskId / 状态 / 视频 URL，
 * 用于工作流端到端联调，待 libs/ai 的 Seedance Provider 就绪后切换。
 */
import { Context } from '@temporalio/activity'
import type {
  GenerationType,
  SeedanceTaskParams,
  SeedanceTaskState,
  VideoDuration,
  VideoResolution,
} from '@reelclone/ai'
import { SeedanceTaskStatus, VideoGenParams, WorkType, type SeedanceActivities } from '../types'
import { getActivityDependencies } from './activity-context'
import { isMockMode, mockId, mockDelay } from './mock.util'

/** Mock 模式下模拟的任务状态机（按调用次数推进） */
const mockStateMap = new Map<string, { calls: number; videoUrl?: string }>()

// ============================================================
// 真实模式：VideoGenParams → SeedanceTaskParams / 状态映射
// ============================================================

/** 将工作流 WorkType 映射为 Seedance GenerationType */
function mapWorkTypeToGenType(workType: WorkType): GenerationType {
  switch (workType) {
    case WorkType.TEXT_TO_VIDEO:
      return 'TEXT_TO_VIDEO' as GenerationType
    case WorkType.IMAGE_TO_VIDEO:
      return 'IMAGE_TO_VIDEO_FIRST_FRAME' as GenerationType
    case WorkType.IMAGE_TO_VIDEO_WITH_TAIL:
      return 'IMAGE_TO_VIDEO_FIRST_LAST_FRAME' as GenerationType
    case WorkType.EDIT_VIDEO:
      return 'EDIT_VIDEO' as GenerationType
    case WorkType.EXTEND_VIDEO:
      return 'EXTEND_VIDEO' as GenerationType
    case WorkType.REFERENCE_TO_VIDEO:
      // Seedance 无原生"参考生视频"，回退为首帧图生视频
      return 'IMAGE_TO_VIDEO_FIRST_FRAME' as GenerationType
    default:
      return 'TEXT_TO_VIDEO' as GenerationType
  }
}

/** 将 Seedance Provider 任务状态映射为 Temporal SeedanceTaskStatus */
function mapSeedanceState(state: SeedanceTaskState): SeedanceTaskStatus {
  switch (state) {
    case 'PENDING':
      return SeedanceTaskStatus.SUBMITTED
    case 'PROCESSING':
      return SeedanceTaskStatus.RUNNING
    case 'SUCCEEDED':
      return SeedanceTaskStatus.COMPLETED
    case 'FAILED':
      return SeedanceTaskStatus.FAILED
    case 'CANCELED':
      return SeedanceTaskStatus.CANCELED
    default:
      return SeedanceTaskStatus.UNKNOWN
  }
}

/** 提交任务到 Seedance，返回 Provider 任务 ID */
export async function submitToSeedance(params: VideoGenParams): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Seedance] 提交视频生成任务', {
    workId: params.workId,
    workType: params.workType,
    modelId: params.modelConfig.modelId,
  })

  if (isMockMode()) {
    // ---- Mock 模式 ----
    // TODO: 待 libs/ai 的 Seedance Provider 就绪后，替换为真实调用
    //   import { seedanceProvider } from '@reelclone/ai'
    //   return seedanceProvider.submit(params)
    await mockDelay(200)
    const taskId = mockId('sd')
    mockStateMap.set(taskId, { calls: 0 })
    ctx.log.info('[Seedance][Mock] 任务已提交', { taskId })
    return taskId
  }

  // ---- 真实模式：通过 Activity 依赖容器调用 SeedanceProvider ----
  const { seedanceProvider } = getActivityDependencies()
  const taskParams: SeedanceTaskParams = {
    type: mapWorkTypeToGenType(params.workType),
    prompt: params.prompt,
    firstFrameUrl: params.modelConfig.firstFrameUrl ?? params.modelConfig.referenceUrl,
    lastFrameUrl: params.modelConfig.lastFrameUrl,
    resolution: params.modelConfig.resolution as VideoResolution | undefined,
    duration: params.modelConfig.duration as VideoDuration | undefined,
    seed: params.modelConfig.seed,
    watermark: false,
    idempotentKey: params.idempotencyKey,
  }
  const result = await seedanceProvider.submitTask(taskParams)
  ctx.log.info('[Seedance] 任务已提交', { taskId: result.taskId, keyIndex: result.keyIndex })
  return result.taskId
}

/** 查询 Seedance 任务状态 */
export async function querySeedanceTask(taskId: string): Promise<{
  status: SeedanceTaskStatus
  videoUrl?: string
  errorMessage?: string
}> {
  const ctx = Context.current()
  ctx.log.info('[Seedance] 查询任务状态', { taskId })

  if (isMockMode()) {
    // ---- Mock 模式：模拟状态推进 ----
    // 第 1-2 次：running，第 3 次：completed，并返回 Mock 视频 URL
    // TODO: 替换为真实轮询
    await mockDelay(100)
    const state = mockStateMap.get(taskId) ?? { calls: 0 }
    state.calls += 1
    mockStateMap.set(taskId, state)

    if (state.calls < 3) {
      return { status: SeedanceTaskStatus.RUNNING }
    }
    const videoUrl = `https://mock-cdn.reelclone.dev/${taskId}/output.mp4`
    state.videoUrl = videoUrl
    return { status: SeedanceTaskStatus.COMPLETED, videoUrl }
  }

  // ---- 真实模式：查询 Provider 任务状态并映射 ----
  const { seedanceProvider } = getActivityDependencies()
  const task = await seedanceProvider.queryTask(taskId)
  const status = mapSeedanceState(task.status)
  const result: { status: SeedanceTaskStatus; videoUrl?: string; errorMessage?: string } = {
    status,
  }
  if (task.result?.videoUrl) {
    result.videoUrl = task.result.videoUrl
  }
  if (task.error) {
    result.errorMessage = task.error
  }
  ctx.log.info('[Seedance] 查询任务状态完成', {
    taskId,
    providerStatus: task.status,
    temporalStatus: status,
    progress: task.progress,
  })
  return result
}

/** 取消 Seedance 任务 */
export async function cancelSeedanceTask(taskId: string): Promise<boolean> {
  const ctx = Context.current()
  ctx.log.info('[Seedance] 取消任务', { taskId })

  if (isMockMode()) {
    // TODO: 替换为真实取消
    await mockDelay(100)
    mockStateMap.delete(taskId)
    return true
  }

  // ---- 真实模式：调用 Provider 取消任务 ----
  const { seedanceProvider } = getActivityDependencies()
  const accepted = await seedanceProvider.cancelTask(taskId)
  if (!accepted) {
    ctx.log.info('[Seedance] 取消任务未被 Provider 接受', { taskId })
    return false
  }

  // Provider 的取消接口可能仅表示“已受理”。只有后续查询明确为 CANCELED 时，
  // 工作流才可以释放预留积分。
  const task = await seedanceProvider.queryTask(taskId)
  const confirmed = task.status === 'CANCELED'
  ctx.log.info('[Seedance] 取消任务状态确认', { taskId, accepted, status: task.status, confirmed })
  return confirmed
}

/** Seedance Activity 实现集合（供 Worker 注册使用） */
export const seedanceActivities: SeedanceActivities = {
  submitToSeedance,
  querySeedanceTask,
  cancelSeedanceTask,
}
