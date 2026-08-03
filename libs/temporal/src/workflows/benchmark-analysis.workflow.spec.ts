/**
 * benchmarkAnalysisWorkflow 单元测试
 *
 * 覆盖：
 *  - Happy Path：分析成功 → settleCredits 被调用
 *  - Failure Path：分析失败 → releaseCredits 被调用
 *  - billingReservation 未提供时（兼容旧数据）→ settle/release 均不调用
 *  - settle/release 使用正确的 userId/benchmarkId/billingReservation
 */

const mockActivities = {
  updateBenchmarkStatus: jest.fn(),
  downloadBenchmarkVideo: jest.fn(),
  analyzeVideo: jest.fn(),
  summarizeReport: jest.fn(),
  notifyUser: jest.fn(),
  settleCredits: jest.fn(),
  releaseCredits: jest.fn(),
}

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
}))

import { BenchmarkStatus as BS, NotificationType, type BenchmarkParams } from '../types'
import { benchmarkAnalysisWorkflow } from './benchmark-analysis.workflow'

function makeParams(overrides?: Partial<BenchmarkParams>): BenchmarkParams {
  return {
    benchmarkId: 'bench-001',
    userId: 'user-001',
    sourceUrl: 'https://www.douyin.com/video/123',
    platform: 'douyin',
    idempotencyKey: 'idem-001',
    billingReservation: {
      freezeId: 'reservation-001',
      amount: 300,
      billingMode: 'v2',
      settleIdempotencyKey: 'benchmark-settle:bench-001:uuid',
      releaseIdempotencyKey: 'benchmark-release:bench-001:uuid',
    },
    ...overrides,
  }
}

const mockStructuredReport = {
  style: '活力',
  shotList: [{ start: 0, end: 3, description: '开场' }],
  sellingPoints: ['高颜值'],
}

describe('benchmarkAnalysisWorkflow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockActivities).forEach((activity) => activity.mockResolvedValue(undefined))
    mockActivities.downloadBenchmarkVideo.mockResolvedValue('/tmp/bench-001.mp4')
    mockActivities.analyzeVideo.mockResolvedValue({ segments: [] })
    mockActivities.summarizeReport.mockResolvedValue(mockStructuredReport)
  })

  it('Happy Path：分析成功后调用 settleCredits 结算冻结积分', async () => {
    const result = await benchmarkAnalysisWorkflow(makeParams())

    expect(result.status).toBe(BS.COMPLETED)
    expect(result.benchmarkId).toBe('bench-001')

    // 验证 settle 被调用
    expect(mockActivities.settleCredits).toHaveBeenCalledTimes(1)
    expect(mockActivities.settleCredits).toHaveBeenCalledWith(
      'user-001',
      'bench-001',
      expect.objectContaining({
        freezeId: 'reservation-001',
        amount: 300,
        settleIdempotencyKey: 'benchmark-settle:bench-001:uuid',
      }),
    )

    // 失败路径不应触发
    expect(mockActivities.releaseCredits).not.toHaveBeenCalled()

    // 验证通知已发送
    expect(mockActivities.notifyUser).toHaveBeenCalledWith(
      'user-001',
      NotificationType.BENCHMARK_COMPLETED,
      expect.objectContaining({ benchmarkId: 'bench-001' }),
    )
  })

  it('Failure Path：分析失败时调用 releaseCredits 释放冻结积分', async () => {
    mockActivities.downloadBenchmarkVideo.mockRejectedValueOnce(new Error('网络超时'))

    const result = await benchmarkAnalysisWorkflow(makeParams())

    expect(result.status).toBe(BS.FAILED)
    expect(result.consumedCredits).toBe(0)
    expect(result.error).toBe('网络超时')

    // 验证 release 被调用
    expect(mockActivities.releaseCredits).toHaveBeenCalledTimes(1)
    expect(mockActivities.releaseCredits).toHaveBeenCalledWith(
      'user-001',
      'bench-001',
      expect.objectContaining({
        freezeId: 'reservation-001',
        amount: 300,
        releaseIdempotencyKey: 'benchmark-release:bench-001:uuid',
      }),
    )

    // 成功路径不应触发
    expect(mockActivities.settleCredits).not.toHaveBeenCalled()

    // 验证失败通知已发送
    expect(mockActivities.notifyUser).toHaveBeenCalledWith(
      'user-001',
      NotificationType.BENCHMARK_FAILED,
      expect.objectContaining({ benchmarkId: 'bench-001', reason: '网络超时' }),
    )
  })

  it('兼容旧数据：billingReservation 未提供时 settle/release 均不调用', async () => {
    const result = await benchmarkAnalysisWorkflow(makeParams({ billingReservation: undefined }))

    expect(result.status).toBe(BS.COMPLETED)
    expect(mockActivities.settleCredits).not.toHaveBeenCalled()
    expect(mockActivities.releaseCredits).not.toHaveBeenCalled()
  })

  it('Failure Path + 无 billingReservation：失败时不调用 releaseCredits', async () => {
    mockActivities.downloadBenchmarkVideo.mockRejectedValueOnce(new Error('下载失败'))

    const result = await benchmarkAnalysisWorkflow(makeParams({ billingReservation: undefined }))

    expect(result.status).toBe(BS.FAILED)
    expect(mockActivities.releaseCredits).not.toHaveBeenCalled()
  })

  it('各阶段状态更新顺序正确', async () => {
    await benchmarkAnalysisWorkflow(makeParams())

    const statusCalls = mockActivities.updateBenchmarkStatus.mock.calls

    // 步骤 1: ANALYZING (downloading)
    expect(statusCalls[0]).toEqual([
      'bench-001',
      BS.ANALYZING,
      { stage: 'downloading' },
    ])

    // 步骤 2: ANALYZING (analyzing)
    expect(statusCalls[1]).toEqual([
      'bench-001',
      BS.ANALYZING,
      expect.objectContaining({ stage: 'analyzing', localPath: '/tmp/bench-001.mp4' }),
    ])

    // 步骤 4: ANALYZING (summarizing)
    expect(statusCalls[2]).toEqual([
      'bench-001',
      BS.ANALYZING,
      { stage: 'summarizing' },
    ])

    // 步骤 5: COMPLETED
    expect(statusCalls[3]).toEqual([
      'bench-001',
      BS.COMPLETED,
      expect.objectContaining({ stage: 'completed' }),
    ])
  })
})
