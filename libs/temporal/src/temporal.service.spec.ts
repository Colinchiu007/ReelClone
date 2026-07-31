jest.mock('./client/temporal.client', () => ({
  getClient: jest.fn(),
  closeClient: jest.fn(),
}))

import { getClient } from './client/temporal.client'
import { TemporalService } from './temporal.service'
import { WorkType, type VideoGenParams } from './types'

describe('TemporalService', () => {
  const start = jest.fn()
  const client = { workflow: { start } }
  const configService = {
    get: jest.fn((key: string) => (key === 'TEMPORAL_NAMESPACE' ? 'reelclone' : undefined)),
  }
  const params: VideoGenParams = {
    workId: 'work-1',
    generationTaskId: 'task-2',
    userId: 'user-3',
    workType: WorkType.TEXT_TO_VIDEO,
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
      freezeId: 'freeze-1',
      amount: 100,
      settleIdempotencyKey: 'generation-1:settle',
      releaseIdempotencyKey: 'generation-1:release',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getClient as jest.Mock).mockResolvedValue(client)
    start.mockResolvedValue(undefined)
  })

  it('使用 GenerationTask 维度的 workflow ID，允许同一 Work 重试', async () => {
    const service = new TemporalService(configService as never)

    await expect(service.startVideoGeneration(params)).resolves.toBe('video-gen-work-1-task-2')

    expect(start).toHaveBeenCalledWith(
      'videoGenerationWorkflow',
      expect.objectContaining({
        workflowId: 'video-gen-work-1-task-2',
        args: [params],
      }),
    )
  })

  it('在请求 Temporal 前公开确定性视频工作流 ID', () => {
    const service = new TemporalService(configService as never)

    expect(service.getVideoGenerationWorkflowId(params)).toBe('video-gen-work-1-task-2')
  })
})
