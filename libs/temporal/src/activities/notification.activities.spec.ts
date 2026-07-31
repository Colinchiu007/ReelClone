/**
 * 通知 Activity 单元测试
 *
 * 覆盖 Mock 模式下的 4 个 Activity：
 * - updateWorkStatus: 更新 Work 状态
 * - updateBenchmarkStatus: 更新 Benchmark 状态
 * - notifyUser: 推送实时事件
 * - sendSubscribeMessage: 发送订阅消息
 *
 * 真实模式分支需 workbench-service / Redis / 微信 API，由集成测试覆盖。
 */
import { Context } from '@temporalio/activity'

// Mock @temporalio/activity 的 Context.current()
// 必须返回同一个对象，否则 Activity 内部调用与测试中验证的不是同一个 jest.fn()
const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}
const mockContext = { log: mockLog }
jest.mock('@temporalio/activity', () => ({
  Context: {
    current: () => mockContext,
  },
}))

jest.mock('./activity-context', () => ({
  getActivityDependencies: jest.fn(),
}))

// 强制 Mock 模式（覆盖 NODE_ENV=production 的默认行为）
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import {
  updateWorkStatus,
  updateBenchmarkStatus,
  notifyUser,
  sendSubscribeMessage,
  notificationActivities,
} from './notification.activities'
import { getActivityDependencies } from './activity-context'
import { WorkStatus, BenchmarkStatus, NotificationType } from '../types'

describe('notification.activities (Mock 模式)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('updateWorkStatus', () => {
    it('Mock 模式返回 true', async () => {
      const result = await updateWorkStatus('work-1', WorkStatus.PROCESSING)
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await updateWorkStatus('work-2', WorkStatus.COMPLETED, { url: 'https://example.com' })
      expect(mockContext.log.info).toHaveBeenCalled()
    })

    it('不传 data 也能正常工作', async () => {
      const result = await updateWorkStatus('work-3', WorkStatus.FAILED)
      expect(result).toBe(true)
    })
  })

  describe('updateBenchmarkStatus', () => {
    it('Mock 模式返回 true', async () => {
      const result = await updateBenchmarkStatus('bench-1', BenchmarkStatus.ANALYZING)
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await updateBenchmarkStatus('bench-2', BenchmarkStatus.COMPLETED, { report: 'xxx' })
      expect(mockContext.log.info).toHaveBeenCalled()
    })

    it('不传 data 也能正常工作', async () => {
      const result = await updateBenchmarkStatus('bench-3', BenchmarkStatus.FAILED)
      expect(result).toBe(true)
    })
  })

  describe('notifyUser', () => {
    it('Mock 模式返回 true', async () => {
      const result = await notifyUser('user-1', NotificationType.WORK_COMPLETED, { workId: 'w1' })
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await notifyUser('user-2', NotificationType.WORK_FAILED, { workId: 'w2' })
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })

  describe('sendSubscribeMessage', () => {
    it('Mock 模式返回 true', async () => {
      const result = await sendSubscribeMessage('user-1', 'tpl-1', { key: 'value' })
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await sendSubscribeMessage('user-2', 'tpl-2', { key: 'value' })
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })

  describe('notificationActivities 集合', () => {
    it('包含全部 4 个 Activity 函数', () => {
      expect(typeof notificationActivities.updateWorkStatus).toBe('function')
      expect(typeof notificationActivities.updateBenchmarkStatus).toBe('function')
      expect(typeof notificationActivities.notifyUser).toBe('function')
      expect(typeof notificationActivities.sendSubscribeMessage).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(notificationActivities.updateWorkStatus).toBe(updateWorkStatus)
      expect(notificationActivities.updateBenchmarkStatus).toBe(updateBenchmarkStatus)
      expect(notificationActivities.notifyUser).toBe(notifyUser)
      expect(notificationActivities.sendSubscribeMessage).toBe(sendSubscribeMessage)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const ctx = Context.current()
      expect(ctx.log.info).toBeDefined()

      await updateWorkStatus('work-ctx', WorkStatus.PROCESSING)
      expect(ctx.log.info).toHaveBeenCalled()
    })
  })
})

describe('notification.activities (真实模式)', () => {
  let originalFlag: string | undefined
  const workflowStateStore = { updateWorkStatus: jest.fn().mockResolvedValue(true) }
  const eventPublisher = { publish: jest.fn().mockResolvedValue(1) }

  beforeAll(() => {
    originalFlag = process.env.TEMPORAL_MOCK_MODE
    process.env.TEMPORAL_MOCK_MODE = 'false'
  })
  afterAll(() => {
    process.env.TEMPORAL_MOCK_MODE = originalFlag
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getActivityDependencies as jest.Mock).mockReturnValue({ workflowStateStore, eventPublisher })
  })

  it('updateWorkStatus 委托给注入的 Work 状态存储', async () => {
    await expect(
      updateWorkStatus('w1', WorkStatus.COMPLETED, { resultKey: 'works/w1.mp4' }, 'task-1'),
    ).resolves.toBe(true)
    expect(workflowStateStore.updateWorkStatus).toHaveBeenCalledWith(
      'w1',
      WorkStatus.COMPLETED,
      { resultKey: 'works/w1.mp4' },
      'task-1',
    )
  })

  it('updateBenchmarkStatus 抛错', async () => {
    await expect(updateBenchmarkStatus('b1', BenchmarkStatus.COMPLETED)).rejects.toThrow(
      '[Notify] 真实模式尚未接入 benchmark-service',
    )
  })

  it('notifyUser 发布完成事件到 notification-service 订阅的频道', async () => {
    await expect(notifyUser('u1', NotificationType.WORK_COMPLETED, { workId: 'w1' })).resolves.toBe(
      true,
    )
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'notification:task-completed',
      JSON.stringify({ userId: 'u1', workId: 'w1', message: undefined }),
    )
  })

  it('失败和超时发布到失败频道', async () => {
    await expect(notifyUser('u1', NotificationType.WORK_TIMEOUT, { workId: 'w1' })).resolves.toBe(
      true,
    )
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'notification:task-failed',
      JSON.stringify({ userId: 'u1', workId: 'w1', message: '视频生成超时' }),
    )
  })

  it('sendSubscribeMessage 抛错', async () => {
    await expect(sendSubscribeMessage('u1', 'tpl-1', { key: 'value' })).rejects.toThrow(
      '[Notify] 真实模式尚未接入微信订阅消息',
    )
  })
})
