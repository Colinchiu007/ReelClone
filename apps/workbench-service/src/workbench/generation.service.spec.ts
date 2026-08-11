/**
 * GenerationService 单元测试
 *
 * 覆盖：
 *  - create：成功 / 积分不足 / Mock 模式 / 幂等
 *  - findAll：分页 + 筛选
 *  - findOne：成功 / 无权限
 *  - cancel：成功
 *  - retry：成功
 */

// Mock @reelclone/temporal 模块，避免加载 temporal activities 时触发
// Context.current()（仅在 Temporal Worker 环境下可用）
jest.mock('@reelclone/temporal', () => ({
  TemporalService: jest.fn().mockImplementation(),
  TemporalModule: { forRoot: jest.fn(), forRootAsync: jest.fn() },
  WorkType: {
    TEXT_TO_VIDEO: 'text_to_video',
    IMAGE_TO_VIDEO: 'image_to_video',
    IMAGE_TO_VIDEO_WITH_TAIL: 'image_to_video_with_tail',
    EDIT_VIDEO: 'edit_video',
    EXTEND_VIDEO: 'extend_video',
    REFERENCE_TO_VIDEO: 'reference_to_video',
  },
}))

import { BusinessException } from '@reelclone/common'
import {
  GenerationExecution,
  GenerationProvider,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus,
  WorkType,
} from '@reelclone/database'
import { CapabilityRegistry, DEFAULT_CAPABILITIES } from '@reelclone/capability'
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { GenerationService } from './generation.service'
import { BillingClient } from './billing.client'
import { type CreateGenerationDto, GenerationType } from './dto/create-generation.dto'
import { ListGenerationsDto } from './dto/list-generations.dto'

// -------------------- Mock 工具 --------------------

/** 模拟 Redis 客户端 */
function mockRedis(): Record<string, jest.Mock> {
  const store = new Map<string, string>()
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ...rest: unknown[]) => {
      let nx = false
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === 'NX') nx = true
      }
      if (nx && store.has(key)) return null
      store.set(key, value)
      return 'OK'
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key)
      return 1
    }),
    eval: jest.fn(async (_script: string, _keyCount: number, key: string, token: string) => {
      if (store.get(key) !== token) return 0
      store.delete(key)
      return 1
    }),
    _store: store,
  } as unknown as Record<string, jest.Mock>
}

/** 模拟 Repository */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (e: unknown) => e),
    create: jest.fn((e: unknown) => e),
    update: jest.fn(async () => ({ affected: 1, generatedMaps: [] })),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

function mockWorkLock(work: Work | null) {
  return {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(work),
  }
}

/** 构造 CreateGenerationDto */
function makeDto(overrides?: Partial<CreateGenerationDto>): CreateGenerationDto {
  return {
    generationType: GenerationType.TEXT_TO_VIDEO,
    prompt: '一只猫在跳舞',
    model: 'seedance2-pro',
    resolution: '720p' as never,
    aspectRatio: '9:16' as never,
    duration: 5,
    ...overrides,
  }
}

describe('GenerationService', () => {
  let service: GenerationService
  let redis: Record<string, jest.Mock>
  let dataSource: jest.Mocked<DataSource>
  let billingClient: jest.Mocked<BillingClient>
  let temporalService: jest.Mocked<{
    startVideoGeneration: jest.Mock
    cancelWorkflow: jest.Mock
    getVideoGenerationWorkflowId: jest.Mock
    isWorkflowStarted: jest.Mock
  }>
  let configService: jest.Mocked<{ get: jest.Mock }>
  let workRepo: jest.Mocked<Repository<Work>>
  let taskRepo: jest.Mocked<Repository<GenerationTask>>
  let executionRepo: jest.Mocked<Repository<GenerationExecution>>

  let registry: CapabilityRegistry

  beforeEach(() => {
    redis = mockRedis()
    workRepo = mockRepo<Work>()
    taskRepo = mockRepo<GenerationTask>()
    executionRepo = mockRepo<GenerationExecution>()
    registry = new CapabilityRegistry(DEFAULT_CAPABILITIES)

    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Work || (entity as { name?: string }).name === 'Work') {
          return workRepo
        }
        if (
          entity === GenerationExecution ||
          (entity as { name?: string }).name === 'GenerationExecution'
        ) {
          return executionRepo
        }
        return taskRepo
      }),
      transaction: jest.fn(
        async (
          fn: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>,
        ) =>
          fn({
            getRepository: (entity: unknown) => {
              if (entity === Work || (entity as { name?: string }).name === 'Work') {
                return workRepo
              }
              return taskRepo
            },
          }),
      ),
    } as unknown as jest.Mocked<DataSource>

    billingClient = {
      freeze: jest.fn().mockResolvedValue({
        frozenAmount: 900,
        balance: 100,
        freezeId: 'freeze-tx-1',
      }),
      settle: jest.fn().mockResolvedValue({ balance: 100, transactionId: 's1' }),
      release: jest.fn().mockResolvedValue({ balance: 100, transactionId: 'r1' }),
    } as unknown as jest.Mocked<BillingClient>

    temporalService = {
      startVideoGeneration: jest.fn().mockResolvedValue('wf-id-123'),
      cancelWorkflow: jest.fn().mockResolvedValue(undefined),
      getVideoGenerationWorkflowId: jest.fn(
        (params: { workId: string; generationTaskId: string }) =>
          `video-gen-${params.workId}-${params.generationTaskId}`,
      ),
      isWorkflowStarted: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<typeof temporalService>

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'true'
        return undefined
      }),
    } as unknown as jest.Mocked<typeof configService>

    const templateClient = {
      incrementUseCount: jest.fn().mockResolvedValue(undefined),
    } as unknown as import('./template.client').TemplateClient

    service = new GenerationService(
      redis as never,
      dataSource,
      billingClient,
      templateClient,
      temporalService as never,
      configService as never,
      registry,
    )
  })

  // -------------------- create --------------------

  describe('create', () => {
    it('成功创建任务（Mock 模式）', async () => {
      const userId = 'user-1'
      const dto = makeDto()

      const result = await service.create(userId, dto)

      // 应创建 Work
      expect(workRepo.save).toHaveBeenCalled()
      // Mock 模式跳过真实 billing freeze
      expect(billingClient.freeze).not.toHaveBeenCalled()
      expect(workRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          modelConfig: expect.objectContaining({
            // mockFreezeId 是 uuidv4() 生成的 UUID（满足 generation_executions.reservation_id 的 uuid 列约束）
            freezeId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
          }),
        }),
      )
      // 应创建 GenerationTask
      expect(taskRepo.save).toHaveBeenCalled()
      // Mock 模式不调用 Temporal
      expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
      // 应返回 workId + taskId
      expect(result.workId).toBeDefined()
      expect(result.taskId).toBeDefined()
      // 应缓存幂等结果
      expect(redis.set).toHaveBeenCalled()
    })

    it('Work 保存失败时应抛出异常', async () => {
      workRepo.save.mockRejectedValueOnce(new Error('database unavailable'))

      await expect(service.create('user-1', makeDto())).rejects.toThrow('database unavailable')
    })

    it('任务持久化失败时释放已冻结积分并标记 Work 失败', async () => {
      taskRepo.save.mockRejectedValueOnce(new Error('task database unavailable'))

      await expect(service.create('user-1', makeDto())).rejects.toThrow('task database unavailable')

      // Mock 模式下使用 mock reservation 释放，freezeId 为 UUID 格式
      expect(billingClient.release).toHaveBeenCalledWith(
        'user-1',
        expect.any(Number),
        expect.stringMatching(/:release$/),
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
        'v2',
      )
      expect(workRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: WorkStatus.FAILED }),
      )
    })

    it('预留释放失败时标记待处理并向调用方返回错误', async () => {
      taskRepo.save.mockRejectedValueOnce(new Error('task database unavailable'))
      billingClient.release.mockRejectedValueOnce(new Error('billing unavailable'))

      await expect(service.create('user-1', makeDto())).rejects.toThrow('billing unavailable')

      expect(workRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: WorkStatus.FAILED,
          errorLog: expect.objectContaining({ step: 'billing_release_pending' }),
        }),
      )
    })

    it('Mock 模式下不调用 Temporal', async () => {
      await service.create('user-1', makeDto())

      expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
      // Mock 模式下任务应被直接标记为 COMPLETED
      expect(taskRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: GenerationTaskStatus.COMPLETED,
          providerTaskId: expect.stringContaining('mock-video-gen-'),
        }),
      )
    })

    it.each([GenerationType.TEXT_GENERATE, GenerationType.IMAGE_GENERATE])(
      '真实模式下拒绝尚未接入 Provider 的 %s，且不创建记录或冻结积分',
      async (generationType) => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'TEMPORAL_MOCK_MODE') return 'false'
          return undefined
        })

        await expect(service.create('user-1', makeDto({ generationType }))).rejects.toThrow(
          '当前仅支持视频生成',
        )

        expect(workRepo.create).not.toHaveBeenCalled()
        expect(workRepo.save).not.toHaveBeenCalled()
        expect(taskRepo.save).not.toHaveBeenCalled()
        expect(billingClient.freeze).not.toHaveBeenCalled()
        expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
      },
    )

    it('幂等：重复请求返回已有 work', async () => {
      const dto = makeDto({ idempotencyKey: 'idem-key-1' })

      // 首次创建
      const first = await service.create('user-1', dto)
      expect(first.workId).toBeDefined()

      // 清除调用记录
      workRepo.save.mockClear()
      billingClient.freeze.mockClear()
      taskRepo.save.mockClear()

      // 第二次使用相同 idempotencyKey
      const second = await service.create('user-1', dto)

      // 应返回相同的 workId
      expect(second.workId).toBe(first.workId)
      // 不应再次创建 Work / 冻结积分
      expect(workRepo.save).not.toHaveBeenCalled()
      expect(billingClient.freeze).not.toHaveBeenCalled()
      expect(taskRepo.save).not.toHaveBeenCalled()
    })

    // -------------------- benchmarkId 透传 --------------------

    it('携带 benchmarkId 时，Work 记录和 VideoGenParams 正确赋值', async () => {
      // 关闭 Mock 模式，使 startWorkflow 走真实 Temporal 路径以校验 VideoGenParams
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })

      const benchmarkId = 'bench-uuid-1'
      const dto = makeDto({ benchmarkId })

      await service.create('user-1', dto)

      // Work 记录应包含 benchmarkId
      expect(workRepo.create).toHaveBeenCalledWith(expect.objectContaining({ benchmarkId }))

      // VideoGenParams 应包含 benchmarkId
      expect(temporalService.startVideoGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ benchmarkId }),
      )
    })

    it('不携带 benchmarkId 时，Work 记录和 VideoGenParams 中 benchmarkId 为 undefined（向后兼容）', async () => {
      // 关闭 Mock 模式，使 startWorkflow 走真实 Temporal 路径以校验 VideoGenParams
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })

      const dto = makeDto() // 不传 benchmarkId

      await service.create('user-1', dto)

      // Work 记录的 benchmarkId 应为 null（dto.benchmarkId ?? null）
      const createCallArg = workRepo.create.mock.calls[0][0] as { benchmarkId: unknown }
      expect(createCallArg.benchmarkId).toBeNull()

      // VideoGenParams 中 benchmarkId 应为 undefined
      const paramsArg = temporalService.startVideoGeneration.mock.calls[0][0] as {
        benchmarkId: unknown
      }
      expect(paramsArg.benchmarkId).toBeUndefined()
    })

    it('工作流启动响应丢失但 Temporal 已存在工作流时保留预留并返回任务', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })
      temporalService.startVideoGeneration.mockRejectedValueOnce(new Error('connection reset'))
      temporalService.isWorkflowStarted.mockResolvedValueOnce(true)

      await expect(service.create('user-1', makeDto())).resolves.toEqual({
        workId: expect.any(String),
        taskId: expect.any(String),
      })

      expect(temporalService.getVideoGenerationWorkflowId).toHaveBeenCalled()
      expect(temporalService.isWorkflowStarted).toHaveBeenCalled()
      expect(billingClient.release).not.toHaveBeenCalled()
      expect(taskRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: GenerationTaskStatus.RUNNING }),
      )
    })
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('分页返回任务列表', async () => {
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'task-1' } as GenerationTask], 1]),
      }
      taskRepo.createQueryBuilder.mockReturnValue(qb as never)

      const result = await service.findAll('user-1', new ListGenerationsDto())

      expect(result.list).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
    })

    it('支持状态筛选', async () => {
      const qb = {
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      taskRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListGenerationsDto()
      dto.status = 'PENDING' as never

      await service.findAll('user-1', dto)

      expect(qb.andWhere).toHaveBeenCalledWith(
        'task.status = :status',
        expect.objectContaining({ status: 'PENDING' }),
      )
    })
  })

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('成功返回任务详情', async () => {
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        status: GenerationTaskStatus.RUNNING,
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
      }
      ;(task as { work: Work }).work = work as Work

      taskRepo.findOne.mockResolvedValue(task as GenerationTask)

      const result = await service.findOne('user-1', 'task-1')
      expect(result.task.id).toBe('task-1')
      expect(result.work.userId).toBe('user-1')
    })

    it('任务不存在时抛异常', async () => {
      taskRepo.findOne.mockResolvedValue(null)

      await expect(service.findOne('user-1', 'nope')).rejects.toThrow(BusinessException)
    })

    it('无权限访问时抛异常', async () => {
      const task: Partial<GenerationTask> = { id: 'task-1' }
      const work: Partial<Work> = { id: 'work-1', userId: 'other-user' }
      ;(task as { work: Work }).work = work as Work

      taskRepo.findOne.mockResolvedValue(task as GenerationTask)

      await expect(service.findOne('user-1', 'task-1')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- cancel --------------------

  describe('cancel', () => {
    it('成功取消任务（Mock 模式不调用 Temporal）', async () => {
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        status: GenerationTaskStatus.RUNNING,
        providerTaskId: 'mock-wf-1',
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        cost: 900,
        modelConfig: {
          freezeId: 'freeze-tx-1',
          idempotencyKey: 'create-generation-1',
          activeExecutionId: 'exec-1',
        },
      }
      ;(task as { work: Work }).work = work as Work

      taskRepo.findOne.mockResolvedValue(task as GenerationTask)

      await service.cancel('user-1', 'task-1')

      // 应更新 Task 状态
      expect(taskRepo.update).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ status: GenerationTaskStatus.FAILED }),
      )
      // 应更新 Work 状态
      expect(workRepo.update).toHaveBeenCalledWith(
        'work-1',
        expect.objectContaining({ status: WorkStatus.CANCELLED }),
      )
      // C1.2: 应更新 GenerationExecution 到 CANCELED
      expect(executionRepo.update).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({ stage: 'CANCELED' }),
      )
      // 应释放积分
      expect(billingClient.release).toHaveBeenCalled()
    })

    it('真实模式下取消工作流失败时不更新状态也不释放积分', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        status: GenerationTaskStatus.RUNNING,
        providerTaskId: 'video-gen-work-1-task-1',
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        cost: 900,
        modelConfig: {
          freezeId: 'freeze-tx-1',
          idempotencyKey: 'create-generation-1',
          activeExecutionId: 'exec-1',
        },
      }
      ;(task as { work: Work }).work = work as Work
      taskRepo.findOne.mockResolvedValue(task as GenerationTask)
      temporalService.cancelWorkflow.mockRejectedValueOnce(new Error('temporal unavailable'))

      await expect(service.cancel('user-1', 'task-1')).rejects.toThrow('取消工作流失败')

      expect(taskRepo.update).not.toHaveBeenCalled()
      expect(workRepo.update).not.toHaveBeenCalled()
      expect(billingClient.release).not.toHaveBeenCalled()
      // C1.2: 取消失败不应更新 Execution
      expect(executionRepo.update).not.toHaveBeenCalled()
    })

    it('真实模式下使用确定性工作流 ID 取消 Seedance 任务，等待工作流确认后才更新状态和退款', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        status: GenerationTaskStatus.RUNNING,
        providerTaskId: 'seedance-task-provider-123',
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        cost: 900,
        modelConfig: {
          freezeId: 'freeze-tx-1',
          idempotencyKey: 'create-generation-1',
          activeExecutionId: 'exec-1',
        },
      }
      ;(task as { work: Work }).work = work as Work
      taskRepo.findOne.mockResolvedValue(task as GenerationTask)

      await expect(service.cancel('user-1', 'task-1')).resolves.toBeUndefined()

      expect(temporalService.getVideoGenerationWorkflowId).toHaveBeenCalledWith({
        workId: 'work-1',
        generationTaskId: 'task-1',
      })
      expect(temporalService.cancelWorkflow).toHaveBeenCalledWith('video-gen-work-1-task-1')
      expect(temporalService.cancelWorkflow).not.toHaveBeenCalledWith('seedance-task-provider-123')
      expect(taskRepo.update).not.toHaveBeenCalled()
      expect(workRepo.update).not.toHaveBeenCalled()
      expect(billingClient.release).not.toHaveBeenCalled()
      // C1.2: 真实模式取消应将 Execution 更新为 PROVIDER_CANCEL_PENDING
      expect(executionRepo.update).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({ stage: 'PROVIDER_CANCEL_PENDING' }),
      )
    })

    it('C1.2: 取消时无 activeExecutionId 则跳过 Execution 更新', async () => {
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        status: GenerationTaskStatus.RUNNING,
        providerTaskId: 'mock-wf-1',
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        cost: 900,
        modelConfig: { freezeId: 'freeze-tx-1', idempotencyKey: 'create-generation-1' },
      }
      ;(task as { work: Work }).work = work as Work
      taskRepo.findOne.mockResolvedValue(task as GenerationTask)

      await service.cancel('user-1', 'task-1')

      // 无 activeExecutionId 时不应调用 executionRepo.update
      expect(executionRepo.update).not.toHaveBeenCalled()
      // 正常流程仍应完成
      expect(taskRepo.update).toHaveBeenCalled()
      expect(workRepo.update).toHaveBeenCalled()
    })
  })

  // -------------------- retry --------------------

  describe('retry', () => {
    it('成功重试任务（创建新 Task，并重新冻结积分）', async () => {
      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        provider: GenerationProvider.SEEDANCE,
        status: GenerationTaskStatus.FAILED,
        attempts: 1,
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.FAILED,
        cost: 900,
        prompt: '一只猫',
        type: WorkType.VIDEO,
        modelConfig: {
          generationType: GenerationType.TEXT_TO_VIDEO,
          resolution: '720p',
          duration: 5,
          freezeId: 'freeze-tx-1',
        },
      }
      ;(task as { work: Work }).work = work as Work

      taskRepo.findOne.mockResolvedValue(task as GenerationTask)
      workRepo.createQueryBuilder.mockReturnValue(mockWorkLock(work as Work) as never)

      const result = await service.retry('user-1', 'task-1')

      // 应创建新 Task
      expect(taskRepo.save).toHaveBeenCalled()
      // 重试应重新冻结积分
      expect(billingClient.freeze).toHaveBeenCalled()
      // 应返回新 taskId
      expect(result.taskId).toBeDefined()
      expect(result.workId).toBe('work-1')
    })

    it('重试时会重新冻结并更新活动任务', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })

      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        provider: GenerationProvider.SEEDANCE,
        status: GenerationTaskStatus.FAILED,
        attempts: 1,
      }
      const work: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.FAILED,
        cost: 900,
        prompt: '一只猫',
        type: WorkType.VIDEO,
        modelConfig: {
          generationType: GenerationType.TEXT_TO_VIDEO,
          resolution: '720p',
          duration: 5,
          freezeId: 'freeze-tx-1',
        },
      }
      ;(task as { work: Work }).work = work as Work
      taskRepo.findOne.mockResolvedValue(task as GenerationTask)
      workRepo.createQueryBuilder.mockReturnValue(mockWorkLock(work as Work) as never)
      temporalService.startVideoGeneration.mockResolvedValueOnce('wf-id-retry')

      await service.retry('user-1', 'task-1')

      expect(billingClient.freeze).toHaveBeenCalledTimes(1)
      expect(temporalService.startVideoGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          generationTaskId: expect.any(String),
          billingReservation: expect.objectContaining({
            freezeId: 'freeze-tx-1',
            billingMode: 'v2',
            settleIdempotencyKey: expect.stringMatching(/:settle$/),
            releaseIdempotencyKey: expect.stringMatching(/:release$/),
          }),
        }),
      )
      expect(workRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: WorkStatus.PENDING,
          errorLog: null,
          modelConfig: expect.objectContaining({
            activeGenerationTaskId: expect.any(String),
          }),
        }),
      )
    })

    it('事务中发现 Work 已被并发重试为 PENDING 时不创建任务、不冻结积分或启动工作流', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TEMPORAL_MOCK_MODE') return 'false'
        return undefined
      })

      const task: Partial<GenerationTask> = {
        id: 'task-1',
        workId: 'work-1',
        provider: GenerationProvider.SEEDANCE,
        status: GenerationTaskStatus.FAILED,
        attempts: 1,
      }
      const requestedWork: Partial<Work> = {
        id: 'work-1',
        userId: 'user-1',
        status: WorkStatus.FAILED,
        cost: 900,
        prompt: '一只猫',
        type: WorkType.VIDEO,
        modelConfig: {
          generationType: GenerationType.TEXT_TO_VIDEO,
          resolution: '720p',
          duration: 5,
          freezeId: 'freeze-tx-1',
        },
      }
      const concurrentlyRetriedWork: Partial<Work> = {
        ...requestedWork,
        status: WorkStatus.PENDING,
      }
      ;(task as { work: Work }).work = requestedWork as Work
      taskRepo.findOne.mockResolvedValue(task as GenerationTask)
      workRepo.createQueryBuilder.mockReturnValue(
        mockWorkLock(concurrentlyRetriedWork as Work) as never,
      )

      await expect(service.retry('user-1', 'task-1')).rejects.toThrow(
        'Work 当前状态为 PENDING，无法重试',
      )

      expect(billingClient.freeze).not.toHaveBeenCalled()
      expect(taskRepo.create).not.toHaveBeenCalled()
      expect(taskRepo.save).not.toHaveBeenCalled()
      expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
    })

    it.each([
      [GenerationType.TEXT_GENERATE, WorkType.TEXT, 5, '生成一段文案'],
      [GenerationType.IMAGE_GENERATE, WorkType.IMAGE, 60, '生成一张图片'],
    ])(
      '真实模式下拒绝重试尚未接入 Provider 的 %s，且不改变任务状态',
      async (generationType, workType, cost, prompt) => {
        configService.get.mockImplementation((key: string) => {
          if (key === 'TEMPORAL_MOCK_MODE') return 'false'
          return undefined
        })

        const task: Partial<GenerationTask> = {
          id: 'task-1',
          workId: 'work-1',
          provider: GenerationProvider.MOCK,
          status: GenerationTaskStatus.FAILED,
          attempts: 1,
        }
        const work: Partial<Work> = {
          id: 'work-1',
          userId: 'user-1',
          status: WorkStatus.FAILED,
          cost,
          prompt,
          type: workType,
          modelConfig: {
            generationType,
            freezeId: 'freeze-tx-1',
          },
        }
        ;(task as { work: Work }).work = work as Work
        taskRepo.findOne.mockResolvedValue(task as GenerationTask)

        await expect(service.retry('user-1', 'task-1')).rejects.toThrow('当前仅支持视频生成')

        expect(taskRepo.save).not.toHaveBeenCalled()
        expect(workRepo.update).not.toHaveBeenCalled()
        expect(billingClient.freeze).not.toHaveBeenCalled()
        expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
      },
    )
  })
})
