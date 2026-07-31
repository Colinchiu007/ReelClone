import { GenerationTaskStatus, Work, WorkStatus as DatabaseWorkStatus } from '@reelclone/database'
import { DataSource } from 'typeorm'
import { TypeOrmWorkflowStateStore } from './workflow-state.store'

describe('TypeOrmWorkflowStateStore', () => {
  const workUpdateQuery = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const workRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => workUpdateQuery),
  }
  const taskRepo = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => (entity === Work ? workRepo : taskRepo)),
  } as unknown as DataSource
  const store = new TypeOrmWorkflowStateStore(dataSource)

  beforeEach(() => {
    jest.clearAllMocks()
    workUpdateQuery.execute.mockResolvedValue({ affected: 1 })
    workRepo.findOne.mockResolvedValue({
      id: 'work-1',
      modelConfig: { activeGenerationTaskId: 'task-current' },
    } as unknown as Work)
  })

  it('完成时同时回写当前 Task 和 Work 的可持久化字段', async () => {
    await store.updateWorkStatus(
      'work-1',
      'completed' as never,
      {
        resultKey: 'works/output.mp4',
        resultUrl: 'https://oss.example/output.mp4',
        coverKey: 'covers/output.jpg',
      },
      'task-current',
    )

    expect(taskRepo.update).toHaveBeenCalledWith(
      { id: 'task-current', workId: 'work-1' },
      expect.objectContaining({
        status: GenerationTaskStatus.COMPLETED,
        completedAt: expect.any(Date),
      }),
    )
    expect(workUpdateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DatabaseWorkStatus.COMPLETED,
        resultKey: 'works/output.mp4',
        resultUrl: 'https://oss.example/output.mp4',
        thumbnailKey: 'covers/output.jpg',
      }),
    )
    expect(workUpdateQuery.andWhere).toHaveBeenCalledWith(
      "model_config ->> 'activeGenerationTaskId' = :generationTaskId",
      { generationTaskId: 'task-current' },
    )
  })

  it('超时映射为数据库 FAILED 并保留错误阶段', async () => {
    await store.updateWorkStatus('work-1', 'timeout' as never, undefined, 'task-current')

    expect(taskRepo.update).toHaveBeenCalledWith(
      { id: 'task-current', workId: 'work-1' },
      expect.objectContaining({ status: GenerationTaskStatus.FAILED, error: '视频生成超时' }),
    )
    expect(workUpdateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DatabaseWorkStatus.FAILED,
        errorLog: expect.objectContaining({ stage: 'timeout', error: '视频生成超时' }),
      }),
    )
  })

  it('处理中回写 Provider 任务 ID 和开始时间', async () => {
    await store.updateWorkStatus(
      'work-1',
      'processing' as never,
      { providerTaskId: 'seedance-task-1' },
      'task-current',
    )

    expect(taskRepo.update).toHaveBeenCalledWith(
      { id: 'task-current', workId: 'work-1' },
      expect.objectContaining({
        status: GenerationTaskStatus.RUNNING,
        providerTaskId: 'seedance-task-1',
        startedAt: expect.any(Date),
      }),
    )
  })

  it('旧任务仍可完成自身 Task，但不能覆盖重试后的 Work', async () => {
    workUpdateQuery.execute.mockResolvedValueOnce({ affected: 0 })
    await store.updateWorkStatus('work-1', 'failed' as never, { error: '旧任务失败' }, 'task-old')

    expect(taskRepo.update).toHaveBeenCalledWith(
      { id: 'task-old', workId: 'work-1' },
      expect.objectContaining({ status: GenerationTaskStatus.FAILED }),
    )
    expect(workUpdateQuery.execute).toHaveBeenCalled()
    expect(workRepo.update).not.toHaveBeenCalled()
  })

  it('处理中保留 Provider 状态未知诊断，同时维持运行状态', async () => {
    await store.updateWorkStatus(
      'work-1',
      'processing' as never,
      {
        stage: 'provider_state_unknown',
        error: 'submission response lost',
        providerTaskId: 'seedance-task-1',
      },
      'task-current',
    )

    expect(taskRepo.update).toHaveBeenCalledWith(
      { id: 'task-current', workId: 'work-1' },
      expect.objectContaining({
        status: GenerationTaskStatus.RUNNING,
        error: 'submission response lost',
      }),
    )
    expect(workUpdateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DatabaseWorkStatus.PROCESSING,
        errorLog: expect.objectContaining({ stage: 'provider_state_unknown' }),
      }),
    )
  })
})
