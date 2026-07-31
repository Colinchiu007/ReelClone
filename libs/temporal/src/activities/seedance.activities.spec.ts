/**
 * Seedance 视频 AI Activity 单元测试
 *
 * 覆盖：
 * - Mock 模式：3 个 Activity 的模拟行为（状态机推进、取消重置）
 * - 真实模式：通过 mock getActivityDependencies 注入 SeedanceProvider，
 *   验证参数映射（mapWorkTypeToGenType）与状态映射（mapSeedanceState）
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

// Mock activity-context 的 getActivityDependencies（真实模式使用）
jest.mock('./activity-context', () => ({
  getActivityDependencies: jest.fn(),
}))

// 强制 Mock 模式（真实模式 describe 内会覆盖为 'false'）
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import { getActivityDependencies } from './activity-context'
import {
  submitToSeedance,
  querySeedanceTask,
  cancelSeedanceTask,
  seedanceActivities,
} from './seedance.activities'
import {
  SeedanceTaskStatus,
  WorkType,
  type BillingReservation,
  type VideoGenParams,
} from '../types'

/** 构造测试用 VideoGenParams */
const buildParams = (overrides?: Partial<VideoGenParams>): VideoGenParams => ({
  workId: 'work-123',
  userId: 'user-123',
  workType: WorkType.TEXT_TO_VIDEO,
  prompt: '测试提示词',
  idempotencyKey: 'idem-key-1',
  estimatedCredits: 10,
  generationTaskId: 'task-123',
  billingReservation: {
    freezeId: 'freeze-123',
    amount: 10,
    settleIdempotencyKey: 'settle-123',
    releaseIdempotencyKey: 'release-123',
  } satisfies BillingReservation,
  modelConfig: {
    modelId: 'seedance-v1',
    resolution: '1080p',
    duration: 5,
    aspectRatio: '16:9',
  },
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
})

// ============================================================
// Mock 模式
// ============================================================
describe('seedance.activities (Mock 模式)', () => {
  describe('submitToSeedance', () => {
    it('返回以 sd- 开头的 taskId', async () => {
      const taskId = await submitToSeedance(buildParams())
      expect(typeof taskId).toBe('string')
      expect(taskId).toMatch(/^sd-/)
    })

    it('调用了 ctx.log.info', async () => {
      await submitToSeedance(buildParams())
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })

  describe('querySeedanceTask 状态机', () => {
    it('前 2 次返回 RUNNING，第 3 次返回 COMPLETED + videoUrl', async () => {
      // 先提交任务，初始化 mockStateMap
      const taskId = await submitToSeedance(buildParams())

      // 第 1 次查询：calls=1，RUNNING
      const r1 = await querySeedanceTask(taskId)
      expect(r1.status).toBe(SeedanceTaskStatus.RUNNING)
      expect(r1.videoUrl).toBeUndefined()

      // 第 2 次查询：calls=2，RUNNING
      const r2 = await querySeedanceTask(taskId)
      expect(r2.status).toBe(SeedanceTaskStatus.RUNNING)
      expect(r2.videoUrl).toBeUndefined()

      // 第 3 次查询：calls=3，COMPLETED + videoUrl
      const r3 = await querySeedanceTask(taskId)
      expect(r3.status).toBe(SeedanceTaskStatus.COMPLETED)
      expect(r3.videoUrl).toBe(`https://mock-cdn.reelclone.dev/${taskId}/output.mp4`)
    })
  })

  describe('cancelSeedanceTask', () => {
    it('返回 true', async () => {
      const taskId = await submitToSeedance(buildParams())
      const ok = await cancelSeedanceTask(taskId)
      expect(ok).toBe(true)
    })

    it('取消后重新 query 从 RUNNING 开始计数', async () => {
      const taskId = await submitToSeedance(buildParams())
      // 先 query 一次（calls=1，RUNNING）
      await querySeedanceTask(taskId)
      // 取消（删除 mockStateMap 中的条目）
      await cancelSeedanceTask(taskId)
      // 重新 query：mockStateMap 无条目，从 calls=0 开始，+1=1，RUNNING
      const r = await querySeedanceTask(taskId)
      expect(r.status).toBe(SeedanceTaskStatus.RUNNING)
    })
  })

  describe('seedanceActivities 集合', () => {
    it('包含 3 个 Activity 函数', () => {
      expect(typeof seedanceActivities.submitToSeedance).toBe('function')
      expect(typeof seedanceActivities.querySeedanceTask).toBe('function')
      expect(typeof seedanceActivities.cancelSeedanceTask).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(seedanceActivities.submitToSeedance).toBe(submitToSeedance)
      expect(seedanceActivities.querySeedanceTask).toBe(querySeedanceTask)
      expect(seedanceActivities.cancelSeedanceTask).toBe(cancelSeedanceTask)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const ctx = Context.current()
      expect(ctx.log.info).toBeDefined()

      await submitToSeedance(buildParams())
      expect(ctx.log.info).toHaveBeenCalled()
    })
  })
})

// ============================================================
// 真实模式
// ============================================================
describe('seedance.activities (真实模式)', () => {
  let originalFlag: string | undefined

  const mockSeedanceProvider = {
    submitTask: jest.fn(),
    queryTask: jest.fn(),
    cancelTask: jest.fn(),
  }

  beforeAll(() => {
    originalFlag = process.env.TEMPORAL_MOCK_MODE
    process.env.TEMPORAL_MOCK_MODE = 'false'
    ;(getActivityDependencies as jest.Mock).mockReturnValue({
      seedanceProvider: mockSeedanceProvider,
    })
  })

  afterAll(() => {
    process.env.TEMPORAL_MOCK_MODE = originalFlag
  })

  describe('submitToSeedance', () => {
    it('调用 seedanceProvider.submitTask 并返回 taskId', async () => {
      mockSeedanceProvider.submitTask.mockResolvedValue({
        taskId: 'real-task-1',
        keyIndex: 0,
      })

      const result = await submitToSeedance(buildParams())

      expect(result).toBe('real-task-1')
      expect(mockSeedanceProvider.submitTask).toHaveBeenCalledTimes(1)
    })

    it('将 WorkType.TEXT_TO_VIDEO 映射为 GenerationType TEXT_TO_VIDEO', async () => {
      mockSeedanceProvider.submitTask.mockResolvedValue({
        taskId: 'real-task-1',
        keyIndex: 0,
      })

      await submitToSeedance(buildParams({ workType: WorkType.TEXT_TO_VIDEO }))

      expect(mockSeedanceProvider.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TEXT_TO_VIDEO',
          prompt: '测试提示词',
        }),
      )
    })

    it('将 WorkType.IMAGE_TO_VIDEO 映射为 GenerationType IMAGE_TO_VIDEO_FIRST_FRAME', async () => {
      mockSeedanceProvider.submitTask.mockResolvedValue({
        taskId: 'real-task-2',
        keyIndex: 0,
      })

      await submitToSeedance(
        buildParams({
          workType: WorkType.IMAGE_TO_VIDEO,
          modelConfig: {
            modelId: 'seedance-v1',
            resolution: '1080p',
            duration: 5,
            aspectRatio: '16:9',
            firstFrameUrl: 'https://example.com/first.png',
          },
        }),
      )

      expect(mockSeedanceProvider.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'IMAGE_TO_VIDEO_FIRST_FRAME',
          firstFrameUrl: 'https://example.com/first.png',
        }),
      )
    })

    it('传递 prompt / firstFrameUrl / lastFrameUrl / idempotentKey 等参数', async () => {
      mockSeedanceProvider.submitTask.mockResolvedValue({
        taskId: 'real-task-3',
        keyIndex: 1,
      })

      await submitToSeedance(
        buildParams({
          prompt: '自定义提示词',
          modelConfig: {
            modelId: 'seedance-v1',
            resolution: '720p',
            duration: 10,
            aspectRatio: '9:16',
            firstFrameUrl: 'https://example.com/frame.png',
            lastFrameUrl: 'https://example.com/tail.png',
            seed: 42,
          },
        }),
      )

      expect(mockSeedanceProvider.submitTask).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: '自定义提示词',
          firstFrameUrl: 'https://example.com/frame.png',
          lastFrameUrl: 'https://example.com/tail.png',
          seed: 42,
          watermark: false,
          idempotentKey: 'idem-key-1',
        }),
      )
    })
  })

  describe('querySeedanceTask 状态映射', () => {
    it('PENDING → SUBMITTED', async () => {
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'PENDING',
        progress: 0,
      })

      const result = await querySeedanceTask('real-task-1')
      expect(result.status).toBe(SeedanceTaskStatus.SUBMITTED)
    })

    it('PROCESSING → RUNNING', async () => {
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'PROCESSING',
        progress: 50,
      })

      const result = await querySeedanceTask('real-task-1')
      expect(result.status).toBe(SeedanceTaskStatus.RUNNING)
    })

    it('SUCCEEDED → COMPLETED 且返回 videoUrl', async () => {
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'SUCCEEDED',
        progress: 100,
        result: { videoUrl: 'https://cdn.example.com/video.mp4' },
      })

      const result = await querySeedanceTask('real-task-1')
      expect(result.status).toBe(SeedanceTaskStatus.COMPLETED)
      expect(result.videoUrl).toBe('https://cdn.example.com/video.mp4')
    })

    it('FAILED → FAILED 且返回 errorMessage', async () => {
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'FAILED',
        error: '生成失败：内容违规',
      })

      const result = await querySeedanceTask('real-task-1')
      expect(result.status).toBe(SeedanceTaskStatus.FAILED)
      expect(result.errorMessage).toBe('生成失败：内容违规')
    })

    it('CANCELED → CANCELED', async () => {
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'CANCELED',
      })

      const result = await querySeedanceTask('real-task-1')
      expect(result.status).toBe(SeedanceTaskStatus.CANCELED)
    })
  })

  describe('cancelSeedanceTask', () => {
    it('Provider 受理且查询确认 CANCELED 时返回 true', async () => {
      mockSeedanceProvider.cancelTask.mockResolvedValue(true)
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'CANCELED',
      })
      const result = await cancelSeedanceTask('real-task-1')
      expect(result).toBe(true)
      expect(mockSeedanceProvider.cancelTask).toHaveBeenCalledWith('real-task-1')
      expect(mockSeedanceProvider.queryTask).toHaveBeenCalledWith('real-task-1')
    })

    it('Provider 仅受理取消但尚未终态时返回 false', async () => {
      mockSeedanceProvider.cancelTask.mockResolvedValue(true)
      mockSeedanceProvider.queryTask.mockResolvedValue({
        taskId: 'real-task-1',
        status: 'PROCESSING',
      })

      await expect(cancelSeedanceTask('real-task-1')).resolves.toBe(false)
    })

    it('provider 返回 false 时返回 false', async () => {
      mockSeedanceProvider.cancelTask.mockResolvedValue(false)
      const result = await cancelSeedanceTask('real-task-1')
      expect(result).toBe(false)
      expect(mockSeedanceProvider.queryTask).not.toHaveBeenCalled()
    })
  })
})
