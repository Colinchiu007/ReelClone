const mockActivities = {
  updateWorkStatus: jest.fn(),
  submitToSeedance: jest.fn(),
  querySeedanceTask: jest.fn(),
  cancelSeedanceTask: jest.fn(),
  postProcessVideo: jest.fn(),
  generateThumbnail: jest.fn(),
  moderateContent: jest.fn(),
  generateSignedUrl: jest.fn(),
  settleCredits: jest.fn(),
  releaseCredits: jest.fn(),
  notifyUser: jest.fn(),
}

jest.mock('@temporalio/workflow', () => ({
  proxyActivities: jest.fn(() => mockActivities),
  sleep: jest.fn().mockResolvedValue(undefined),
  isCancellation: jest.fn(() => false),
  CancellationScope: {
    nonCancellable: jest.fn((fn: () => Promise<unknown>) => fn()),
  },
}))

import { SeedanceTaskStatus, WorkStatus, type VideoGenParams } from '../types'
import { videoGenerationWorkflow } from './video-generation.workflow'

function makeParams(): VideoGenParams {
  return {
    workId: 'work-1',
    generationTaskId: 'task-1',
    userId: 'user-1',
    workType: 'text_to_video' as never,
    prompt: 'test prompt',
    modelConfig: {
      modelId: 'seedance2-pro',
      duration: 5,
      resolution: '720p',
      aspectRatio: '9:16',
    },
    estimatedCredits: 100,
    idempotencyKey: 'generation-1',
    billingReservation: {
      freezeId: 'reservation-1',
      amount: 100,
      settleIdempotencyKey: 'generation-1:settle',
      releaseIdempotencyKey: 'generation-1:release',
    },
  }
}

describe('videoGenerationWorkflow provider safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.values(mockActivities).forEach((activity) => activity.mockResolvedValue(undefined))
  })

  it('提交回执丢失时保留预留并记录 provider_state_unknown', async () => {
    mockActivities.submitToSeedance.mockRejectedValueOnce(new Error('ECONNRESET'))

    await expect(videoGenerationWorkflow(makeParams())).rejects.toThrow('Provider 提交状态未确认')

    expect(mockActivities.releaseCredits).not.toHaveBeenCalled()
    expect(mockActivities.cancelSeedanceTask).not.toHaveBeenCalled()
    expect(mockActivities.updateWorkStatus).toHaveBeenLastCalledWith(
      'work-1',
      WorkStatus.PROCESSING,
      expect.objectContaining({ stage: 'provider_state_unknown', error: 'ECONNRESET' }),
      'task-1',
    )
  })

  it('轮询状态失败且 Provider 未确认取消时不退款', async () => {
    mockActivities.submitToSeedance.mockResolvedValueOnce('seedance-1')
    mockActivities.querySeedanceTask.mockRejectedValueOnce(new Error('provider unavailable'))
    mockActivities.cancelSeedanceTask.mockResolvedValueOnce(false)

    await expect(videoGenerationWorkflow(makeParams())).rejects.toThrow('Provider 取消未确认')

    expect(mockActivities.releaseCredits).not.toHaveBeenCalled()
    expect(mockActivities.updateWorkStatus).toHaveBeenLastCalledWith(
      'work-1',
      WorkStatus.PROCESSING,
      expect.objectContaining({ stage: 'provider_cancel_pending' }),
      'task-1',
    )
  })

  it('轮询状态失败但 Provider 已确认取消后才退款', async () => {
    mockActivities.submitToSeedance.mockResolvedValueOnce('seedance-1')
    mockActivities.querySeedanceTask.mockRejectedValueOnce(new Error('provider unavailable'))
    mockActivities.cancelSeedanceTask.mockResolvedValueOnce(true)

    await expect(videoGenerationWorkflow(makeParams())).resolves.toMatchObject({
      status: WorkStatus.FAILED,
      consumedCredits: 0,
    })

    expect(mockActivities.releaseCredits).toHaveBeenCalledTimes(1)
    expect(mockActivities.cancelSeedanceTask.mock.invocationCallOrder[0]).toBeLessThan(
      mockActivities.releaseCredits.mock.invocationCallOrder[0],
    )
  })

  it('Provider 明确失败时仍走失败退款路径，不发取消请求', async () => {
    mockActivities.submitToSeedance.mockResolvedValueOnce('seedance-1')
    mockActivities.querySeedanceTask.mockResolvedValueOnce({
      status: SeedanceTaskStatus.FAILED,
      errorMessage: 'provider rejected request',
    })

    await expect(videoGenerationWorkflow(makeParams())).resolves.toMatchObject({
      status: WorkStatus.FAILED,
      error: 'provider rejected request',
    })

    expect(mockActivities.releaseCredits).toHaveBeenCalledTimes(1)
    expect(mockActivities.cancelSeedanceTask).not.toHaveBeenCalled()
  })
})
