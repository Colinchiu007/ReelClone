/**
 * Reconciler Activities（C5）单元测试
 *
 * 覆盖 10 个场景：
 * - Mock 模式：5 个 Activity 的安全默认行为
 * - 真实模式：
 *   1. scanPendingExecutions 返回待处理记录 + 过滤近期已处理
 *   2. claimExecution CAS 成功/失败
 *   3. queryProviderTaskStatus 委托适配器 + 无适配器报错
 *   4. updateExecutionStage 终态更新 Work + 非终态只更新 stage
 *   5. releaseClaim 释放 claim
 */
// Mock @temporalio/activity 的 Context.current()
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

// Mock mock.util
jest.mock('./mock.util', () => ({
  isMockMode: jest.fn(),
}))

// 强制 Mock 模式（真实模式 describe 内会覆盖为 'false'）
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import { getActivityDependencies } from './activity-context'
import { isMockMode } from './mock.util'
import {
  scanPendingExecutions,
  claimExecution,
  queryProviderTaskStatus,
  updateExecutionStage,
  releaseClaim,
  reconcilerActivities,
} from './reconciler.activities'

const mockGetActivityDependencies = getActivityDependencies as jest.MockedFunction<
  typeof getActivityDependencies
>
const mockIsMockMode = isMockMode as jest.MockedFunction<typeof isMockMode>

// ============================================================
// Mock 模式
// ============================================================
describe('Reconciler Activities — Mock 模式', () => {
  beforeAll(() => {
    process.env.TEMPORAL_MOCK_MODE = 'true'
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsMockMode.mockReturnValue(true)
  })

  it('scanPendingExecutions 返回空数组', async () => {
    const result = await scanPendingExecutions({ batchSize: 10, claimTimeoutMs: 300_000 })
    expect(result).toEqual([])
  })

  it('claimExecution 返回 true', async () => {
    const result = await claimExecution({ executionId: 'exec-1', reconcilerOwner: 'worker-1' })
    expect(result).toBe(true)
  })

  it('queryProviderTaskStatus 返回 UNKNOWN', async () => {
    const result = await queryProviderTaskStatus({
      providerName: 'seedance',
      providerTaskId: 'task-1',
    })
    expect(result).toEqual({ status: 'UNKNOWN' })
  })

  it('updateExecutionStage 静默完成', async () => {
    await expect(
      updateExecutionStage({
        executionId: 'exec-1',
        generationWorkId: 'work-1',
        newStage: 'COMPLETED',
      }),
    ).resolves.toBeUndefined()
  })

  it('releaseClaim 静默完成', async () => {
    await expect(releaseClaim({ executionId: 'exec-1' })).resolves.toBeUndefined()
  })

  it('reconcilerActivities 导出包含全部 5 个函数', () => {
    expect(Object.keys(reconcilerActivities)).toEqual([
      'scanPendingExecutions',
      'claimExecution',
      'queryProviderTaskStatus',
      'updateExecutionStage',
      'releaseClaim',
    ])
  })
})

// ============================================================
// 真实模式
// ============================================================
describe('Reconciler Activities — 真实模式', () => {
  // Mock repositories
  const mockExecutionRepo = {
    find: jest.fn(),
    update: jest.fn(),
  }
  const mockWorkRepo = {
    find: jest.fn(),
    update: jest.fn(),
  }
  const mockProviderQuery = jest.fn()

  beforeAll(() => {
    process.env.TEMPORAL_MOCK_MODE = 'false'
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsMockMode.mockReturnValue(false)
    mockGetActivityDependencies.mockReturnValue({
      executionRepo: mockExecutionRepo as never,
      workRepo: mockWorkRepo as never,
      providerQuery: mockProviderQuery,
    } as never)
    mockExecutionRepo.find.mockResolvedValue([])
    mockExecutionRepo.update.mockResolvedValue({ affected: 1 })
    mockWorkRepo.update.mockResolvedValue({ affected: 1 })
  })

  // ---- scanPendingExecutions ----
  describe('scanPendingExecutions', () => {
    it('返回待处理记录并过滤近期已处理的', async () => {
      const now = new Date()
      const oldRecord = {
        id: 'exec-1',
        generationWorkId: 'work-1',
        stage: 'INITIATED',
        providerName: 'seedance',
        providerTaskId: 'task-1',
        recoveryDeadline: null,
        lastReconciledAt: new Date(now.getTime() - 600_000), // 10 分钟前
      }
      const recentRecord = {
        id: 'exec-2',
        generationWorkId: 'work-2',
        stage: 'OUTPUT_READY',
        providerName: 'seedance',
        providerTaskId: 'task-2',
        recoveryDeadline: null,
        lastReconciledAt: new Date(now.getTime() - 60_000), // 1 分钟前（未超时）
      }
      mockExecutionRepo.find.mockResolvedValue([oldRecord, recentRecord])

      const result = await scanPendingExecutions({ batchSize: 50, claimTimeoutMs: 300_000 })

      // 只返回超过 claimTimeout 的记录
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exec-1')
    })

    it('返回 null lastReconciledAt 的记录（从未被 reconcile）', async () => {
      const record = {
        id: 'exec-new',
        generationWorkId: 'work-new',
        stage: 'INITIATED',
        providerName: null,
        providerTaskId: null,
        recoveryDeadline: null,
        lastReconciledAt: null,
      }
      mockExecutionRepo.find.mockResolvedValue([record])

      const result = await scanPendingExecutions({ batchSize: 50, claimTimeoutMs: 300_000 })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('exec-new')
    })

    it('无待处理记录时返回空数组', async () => {
      mockExecutionRepo.find.mockResolvedValue([])

      const result = await scanPendingExecutions({ batchSize: 50, claimTimeoutMs: 300_000 })

      expect(result).toEqual([])
      expect(mockLog.info).toHaveBeenCalledWith('C5: reconcile — 扫描完成', { found: 0 })
    })
  })

  // ---- claimExecution ----
  describe('claimExecution', () => {
    it('claim 成功返回 true', async () => {
      mockExecutionRepo.update.mockResolvedValue({ affected: 1 })

      const result = await claimExecution({
        executionId: 'exec-1',
        reconcilerOwner: 'worker-A',
      })

      expect(result).toBe(true)
      expect(mockLog.info).toHaveBeenCalledWith('C5: reconcile — claim 成功', {
        executionId: 'exec-1',
        reconcilerOwner: 'worker-A',
      })
    })

    it('claim 失败（已被占用）返回 false', async () => {
      mockExecutionRepo.update.mockResolvedValue({ affected: 0 })

      const result = await claimExecution({
        executionId: 'exec-1',
        reconcilerOwner: 'worker-A',
      })

      expect(result).toBe(false)
      expect(mockLog.warn).toHaveBeenCalledWith(
        'C5: reconcile — claim 失败（已被其他 worker 占用）',
        { executionId: 'exec-1' },
      )
    })
  })

  // ---- queryProviderTaskStatus ----
  describe('queryProviderTaskStatus', () => {
    it('委托 providerQuery 适配器', async () => {
      mockProviderQuery.mockResolvedValue({
        status: 'COMPLETED',
        videoUrl: 'https://example.com/video.mp4',
      })

      const result = await queryProviderTaskStatus({
        providerName: 'seedance',
        providerTaskId: 'task-123',
      })

      expect(result).toEqual({
        status: 'COMPLETED',
        videoUrl: 'https://example.com/video.mp4',
        errorMessage: undefined,
      })
      expect(mockProviderQuery).toHaveBeenCalledWith('seedance', 'task-123')
    })

    it('无适配器时抛出错误', async () => {
      mockGetActivityDependencies.mockReturnValue({
        executionRepo: mockExecutionRepo as never,
        workRepo: mockWorkRepo as never,
        providerQuery: undefined,
      } as never)

      await expect(
        queryProviderTaskStatus({ providerName: 'unknown', providerTaskId: 'task-1' }),
      ).rejects.toThrow('No provider query adapter for "unknown"')
    })
  })

  // ---- updateExecutionStage ----
  describe('updateExecutionStage', () => {
    it('终态 COMPLETED：更新 stage + Work + 释放 claim', async () => {
      await updateExecutionStage({
        executionId: 'exec-1',
        generationWorkId: 'work-1',
        newStage: 'COMPLETED',
        videoUrl: 'https://example.com/result.mp4',
      })

      // 1. 更新 Execution stage
      expect(mockExecutionRepo.update).toHaveBeenCalledWith('exec-1', {
        stage: 'COMPLETED',
        metadata: JSON.stringify({ reconciledVideoUrl: 'https://example.com/result.mp4' }),
      })

      // 2. 更新 Work 为 completed
      expect(mockWorkRepo.update).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({
          status: 'completed',
          videoUrl: 'https://example.com/result.mp4',
        }),
      )

      // 3. 释放 claim
      expect(mockExecutionRepo.update).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({ reconcilerOwner: null }),
      )
    })

    it('终态 FAILED：更新 stage + Work(error) + 释放 claim', async () => {
      await updateExecutionStage({
        executionId: 'exec-2',
        generationWorkId: 'work-2',
        newStage: 'FAILED',
        errorMessage: 'Provider timeout',
      })

      expect(mockExecutionRepo.update).toHaveBeenCalledWith('exec-2', {
        stage: 'FAILED',
        metadata: JSON.stringify({ reconciledError: 'Provider timeout' }),
      })

      expect(mockWorkRepo.update).toHaveBeenCalledWith(
        'work-2',
        expect.objectContaining({
          status: 'failed',
          error: 'Provider timeout',
        }),
      )
    })

    it('非终态 OUTPUT_READY：只更新 stage + 释放 claim，不更新 Work', async () => {
      await updateExecutionStage({
        executionId: 'exec-3',
        generationWorkId: 'work-3',
        newStage: 'OUTPUT_READY',
      })

      expect(mockExecutionRepo.update).toHaveBeenCalledWith('exec-3', {
        stage: 'OUTPUT_READY',
      })

      // 非终态不应更新 Work
      expect(mockWorkRepo.update).not.toHaveBeenCalled()
    })

    it('同时有 videoUrl 和 errorMessage 时合并 metadata', async () => {
      await updateExecutionStage({
        executionId: 'exec-4',
        generationWorkId: 'work-4',
        newStage: 'COMPLETED',
        videoUrl: 'https://example.com/v.mp4',
        errorMessage: 'partial error',
      })

      expect(mockExecutionRepo.update).toHaveBeenCalledWith('exec-4', {
        stage: 'COMPLETED',
        metadata: JSON.stringify({
          reconciledVideoUrl: 'https://example.com/v.mp4',
          reconciledError: 'partial error',
        }),
      })
    })
  })

  // ---- releaseClaim ----
  describe('releaseClaim', () => {
    it('释放 claim 成功', async () => {
      await releaseClaim({ executionId: 'exec-1' })

      expect(mockExecutionRepo.update).toHaveBeenCalledWith('exec-1', {
        reconcilerOwner: null,
        lastReconciledAt: expect.any(Date),
      })
    })
  })
})
