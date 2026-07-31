/**
 * 通知 Activity
 *
 * 负责：
 * - 更新 Work / Benchmark 业务状态（写库）
 * - 通过 Redis Pub/Sub 推送实时事件给用户（WebSocket 在线推送）
 * - 发送微信订阅消息（离线通知）
 */
import { Context } from '@temporalio/activity'
import {
  BenchmarkStatus,
  NotificationType,
  WorkStatus,
  type NotificationActivities,
} from '../types'
import { getActivityDependencies } from './activity-context'
import { isMockMode, mockDelay } from './mock.util'

/**
 * 更新 Work 业务状态
 * 调用 workbench-service 的内部接口或直接写库
 */
export async function updateWorkStatus(
  workId: string,
  status: WorkStatus,
  data?: Record<string, unknown>,
  generationTaskId?: string,
): Promise<boolean> {
  const ctx = Context.current()
  ctx.log.info('[Notify] 更新 Work 状态', { workId, status, data })

  if (isMockMode()) {
    await mockDelay(100)
    return true
  }

  const { workflowStateStore } = getActivityDependencies()
  return workflowStateStore.updateWorkStatus(workId, status, data, generationTaskId)
}

/**
 * 更新 Benchmark 业务状态
 */
export async function updateBenchmarkStatus(
  benchmarkId: string,
  status: BenchmarkStatus,
  data?: Record<string, unknown>,
): Promise<boolean> {
  const ctx = Context.current()
  ctx.log.info('[Notify] 更新 Benchmark 状态', { benchmarkId, status, data })

  if (isMockMode()) {
    // TODO: 替换为真实数据库更新
    //   import { benchmarkRepository } from '@reelclone/database'
    //   await benchmarkRepository.update(benchmarkId, { status, ...data })
    await mockDelay(100)
    return true
  }

  throw new Error('[Notify] 真实模式尚未接入 benchmark-service')
}

/**
 * 通过 Redis Pub/Sub 发布事件，通知用户的在线 WebSocket 连接
 * 频道格式：user:{userId}:events
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
): Promise<boolean> {
  const ctx = Context.current()
  ctx.log.info('[Notify] 推送实时事件', { userId, type, data })

  if (isMockMode()) {
    await mockDelay(80)
    return true
  }

  const { eventPublisher } = getActivityDependencies()
  const workId = typeof data.workId === 'string' ? data.workId : undefined
  let channel: string
  let payload: Record<string, unknown>

  switch (type) {
    case NotificationType.WORK_COMPLETED:
      if (!workId) throw new Error('[Notify] WORK_COMPLETED 缺少 workId')
      channel = 'notification:task-completed'
      payload = {
        userId,
        workId,
        message: typeof data.message === 'string' ? data.message : undefined,
      }
      break
    case NotificationType.WORK_FAILED:
    case NotificationType.WORK_TIMEOUT:
      if (!workId) throw new Error(`[Notify] ${type} 缺少 workId`)
      channel = 'notification:task-failed'
      payload = {
        userId,
        workId,
        message:
          typeof data.reason === 'string'
            ? data.reason
            : type === NotificationType.WORK_TIMEOUT
              ? '视频生成超时'
              : '视频生成失败',
      }
      break
    default:
      channel = 'notification:system'
      payload = {
        userId,
        title: type === NotificationType.BENCHMARK_COMPLETED ? '对标解析完成' : '对标解析失败',
        content: typeof data.reason === 'string' ? data.reason : undefined,
        data,
      }
  }

  await eventPublisher.publish(channel, JSON.stringify(payload))
  return true
}

/**
 * 发送微信订阅消息（用户离线时的兜底通知）
 */
export async function sendSubscribeMessage(
  userId: string,
  templateId: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const ctx = Context.current()
  ctx.log.info('[Notify] 发送订阅消息', { userId, templateId, data })

  if (isMockMode()) {
    // TODO: 替换为真实微信订阅消息 API
    //   import { wechatService } from '@reelclone/common'
    //   await wechatService.sendSubscribeMessage({ userId, templateId, data })
    await mockDelay(120)
    return true
  }

  throw new Error('[Notify] 真实模式尚未接入微信订阅消息')
}

/** 通知 Activity 实现集合 */
export const notificationActivities: NotificationActivities = {
  updateWorkStatus,
  updateBenchmarkStatus,
  notifyUser,
  sendSubscribeMessage,
}
