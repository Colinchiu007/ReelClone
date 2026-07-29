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
  GenerationProvider,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus,
  WorkType,
} from '@reelclone/database'
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
  }>
  let configService: jest.Mocked<{ get: jest.Mock }>
  let workRepo: jest.Mocked<Repository<Work>>
  let taskRepo: jest.Mocked<Repository<GenerationTask>>

  beforeEach(() => {
    redis = mockRedis()
    workRepo = mockRepo<Work>()
    taskRepo = mockRepo<GenerationTask>()

    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Work || (entity as { name?: string }).name === 'Work') {
          return workRepo
        }
        return taskRepo
      }),
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
      // 应调用 billing freeze
      expect(billingClient.freeze).toHaveBeenCalledWith(
        userId,
        expect.any(Number),
        expect.any(String),
        expect.any(String),
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

    it('积分不足时抛异常并标记 Work 为 FAILED', async () => {
      billingClient.freeze.mockRejectedValue(BusinessException.insufficientCredits('积分不足'))

      await expect(service.create('user-1', makeDto())).rejects.toThrow(BusinessException)

      // 应更新 Work 状态为 FAILED
      expect(workRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: WorkStatus.FAILED }),
      )
    })

    it('Mock 模式下不调用 Temporal', async () => {
      await service.create('user-1', makeDto())

      expect(temporalService.startVideoGeneration).not.toHaveBeenCalled()
      // 任务应被更新为 RUNNING（模拟）
      expect(taskRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: GenerationTaskStatus.RUNNING,
        }),
      )
    })

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
        modelConfig: { freezeId: 'freeze-tx-1' },
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
      // 应释放积分
      expect(billingClient.release).toHaveBeenCalled()
    })
  })

  // -------------------- retry --------------------

  describe('retry', () => {
    it('成功重试任务（创建新 Task，不重复冻结积分）', async () => {
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

      const result = await service.retry('user-1', 'task-1')

      // 应创建新 Task
      expect(taskRepo.save).toHaveBeenCalled()
      // 不应重复冻结积分
      expect(billingClient.freeze).not.toHaveBeenCalled()
      // 应返回新 taskId
      expect(result.taskId).toBeDefined()
      expect(result.workId).toBe('work-1')
    })
  })
})
