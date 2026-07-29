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
import {
  SeedanceTaskStatus,
  VideoGenParams,
  type SeedanceActivities,
} from '../types'
import { isMockMode, mockId, mockDelay } from './mock.util'

/** Mock 模式下模拟的任务状态机（按调用次数推进） */
const mockStateMap = new Map<string, { calls: number; videoUrl?: string }>()

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

  // ---- 真实模式（占位，待接入 libs/ai） ----
  // const { seedanceProvider } = await import('@reelclone/ai')
  // return seedanceProvider.submit({
  //   prompt: params.prompt,
  //   modelId: params.modelConfig.modelId,
  //   duration: params.modelConfig.duration,
  //   resolution: params.modelConfig.resolution,
  //   firstFrameUrl: params.modelConfig.firstFrameUrl,
  //   lastFrameUrl: params.modelConfig.lastFrameUrl,
  // })
  throw new Error('[Seedance] 真实模式尚未接入 libs/ai，请设置 TEMPORAL_MOCK_MODE=true')
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

  // ---- 真实模式（占位） ----
  // const { seedanceProvider } = await import('@reelclone/ai')
  // return seedanceProvider.query(taskId)
  throw new Error('[Seedance] 真实模式尚未接入 libs/ai')
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

  // const { seedanceProvider } = await import('@reelclone/ai')
  // return seedanceProvider.cancel(taskId)
  throw new Error('[Seedance] 真实模式尚未接入 libs/ai')
}

/** Seedance Activity 实现集合（供 Worker 注册使用） */
export const seedanceActivities: SeedanceActivities = {
  submitToSeedance,
  querySeedanceTask,
  cancelSeedanceTask,
}
