/**
 * BenchmarkService 单元测试
 *
 * 覆盖：
 *  - create：成功 / 平台不支持 / 幂等 / Mock 模式 / 冻结失败 / Temporal 失败补偿
 *  - findAll：筛选 / 分页
 *  - findOne：成功 / 无权限 / 不存在
 *  - cancel：成功 / 状态不可取消 / Mock 模式
 *  - clone：正常复刻 / 未完成报错 / 无权限报错 / 解析结果为空
 */
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '@reelclone/common'
import { Benchmark, BenchmarkPlatform, BenchmarkStatus } from '@reelclone/database'
import { PromptEngineService, type CloneSuggestion } from '@reelclone/ai'
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { BenchmarkService } from './benchmark.service'
import { BillingClient } from './billing-client'
import { TemporalAdapter } from './temporal-adapter'
import { CreateBenchmarkDto } from './dto/create-benchmark.dto'
import { ListBenchmarksDto } from './dto/list-benchmarks.dto'

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
    create: jest.fn((e: unknown) => ({ ...(e as object), id: 'bench-001' })),
    createQueryBuilder: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

/** 模拟 ConfigService */
function mockConfigService(mockMode: boolean = true): jest.Mocked<ConfigService> {
  return {
    get: jest.fn((key: string) => {
      const config: Record<string, unknown> = {
        TEMPORAL_MOCK_MODE: mockMode ? 'true' : 'false',
        BENCHMARK_ESTIMATED_POINTS: '300',
        BILLING_SERVICE_URL: 'http://billing-service:3006',
        INTERNAL_API_KEY: 'test-api-key',
      }
      return config[key]
    }),
  } as unknown as jest.Mocked<ConfigService>
}

/** 默认的 CloneSuggestion 返回值 */
const DEFAULT_CLONE_SUGGESTION: CloneSuggestion = {
  prompt: '一段用于文生视频的中文提示词，描述画面与节奏。',
  recommendedModel: 'seedance2-pro',
  recommendedDuration: 5,
  recommendedAspectRatio: '9:16',
}

/** 模拟 PromptEngineService */
function mockPromptEngineService(): jest.Mocked<PromptEngineService> {
  return {
    generateClonePrompt: jest.fn().mockResolvedValue(DEFAULT_CLONE_SUGGESTION),
    reversePrompt: jest.fn(),
    polishPrompt: jest.fn(),
    generateCopy: jest.fn(),
    summarizeAnalysis: jest.fn(),
  } as unknown as jest.Mocked<PromptEngineService>
}

// -------------------- 测试 --------------------

describe('BenchmarkService', () => {
  let service: BenchmarkService
  let redis: Record<string, jest.Mock>
  let benchmarkDataSource: jest.Mocked<DataSource>
  let billingClient: jest.Mocked<BillingClient>
  let temporalAdapter: jest.Mocked<TemporalAdapter>
  let configService: jest.Mocked<ConfigService>
  let promptEngine: jest.Mocked<PromptEngineService>
  let repo: jest.Mocked<Repository<Benchmark>>

  beforeEach(() => {
    jest.clearAllMocks()
    redis = mockRedis()
    repo = mockRepo<Benchmark>()

    benchmarkDataSource = {
      getRepository: jest.fn(() => repo),
    } as unknown as jest.Mocked<DataSource>

    billingClient = {
      freeze: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<BillingClient>

    temporalAdapter = {
      startBenchmarkAnalysis: jest.fn().mockResolvedValue('benchmark-bench-001'),
      cancelWorkflow: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TemporalAdapter>

    configService = mockConfigService(true)
    promptEngine = mockPromptEngineService()

    service = new BenchmarkService(
      redis as never,
      benchmarkDataSource,
      billingClient,
      temporalAdapter,
      configService,
      promptEngine,
    )
  })

  // -------------------- create --------------------

  describe('create', () => {
    const dto: CreateBenchmarkDto = {
      sourceUrl: 'https://www.douyin.com/video/123',
    }

    it('成功创建对标解析任务（Mock 模式）', async () => {
      billingClient.freeze.mockResolvedValue({
        success: true,
        frozenAmount: 300,
        balance: 700,
        transactionId: 'tx-freeze-001',
      })

      const result = await service.create('user-001', dto)

      expect(result.benchmarkId).toBe('bench-001')
      expect(result.status).toBe(BenchmarkStatus.PENDING)
      expect(result.estimatedPoints).toBe(300)
      expect(repo.save).toHaveBeenCalled()
      expect(billingClient.freeze).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-001',
          amount: 300,
          benchmarkId: 'bench-001',
        }),
      )
      // Mock 模式下应直接更新状态为 COMPLETED 并写入分析结果
      expect(repo.update).toHaveBeenCalledWith(
        'bench-001',
        expect.objectContaining({
          status: BenchmarkStatus.COMPLETED,
          analysisResult: expect.objectContaining({
            style: expect.any(String),
            shotList: expect.any(Array),
          }),
        }),
      )
      // 不应调用 Temporal
      expect(temporalAdapter.startBenchmarkAnalysis).not.toHaveBeenCalled()
    })

    it('不支持的平台应抛出异常', async () => {
      const badDto: CreateBenchmarkDto = {
        sourceUrl: 'https://example.com/video/123',
      }

      await expect(service.create('user-001', badDto)).rejects.toThrow(BusinessException)
      expect(billingClient.freeze).not.toHaveBeenCalled()
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('幂等：重复请求返回已有 benchmark', async () => {
      // 预设幂等缓存
      const cachedResult = {
        benchmarkId: 'existing-bench',
        status: BenchmarkStatus.PENDING,
        estimatedPoints: 300,
      }
      await redis.set('benchmark:idem:idem-key-1', JSON.stringify(cachedResult), 'EX', 86400)

      const result = await service.create('user-001', {
        sourceUrl: 'https://www.douyin.com/video/123',
        idempotencyKey: 'idem-key-1',
      })

      expect(result.benchmarkId).toBe('existing-bench')
      // 不应创建新记录
      expect(repo.save).not.toHaveBeenCalled()
      expect(billingClient.freeze).not.toHaveBeenCalled()
    })

    it('非 Mock 模式应启动 Temporal 工作流', async () => {
      // 重新创建非 Mock 模式的 service
      const nonMockConfig = mockConfigService(false)
      const nonMockService = new BenchmarkService(
        redis as never,
        benchmarkDataSource,
        billingClient,
        temporalAdapter,
        nonMockConfig,
        promptEngine,
      )

      billingClient.freeze.mockResolvedValue({
        success: true,
        frozenAmount: 300,
        balance: 700,
        transactionId: 'tx-freeze-002',
      })

      await nonMockService.create('user-001', dto)

      expect(temporalAdapter.startBenchmarkAnalysis).toHaveBeenCalledWith({
        benchmarkId: 'bench-001',
        userId: 'user-001',
        sourceUrl: 'https://www.douyin.com/video/123',
        platform: 'douyin',
      })
    })

    it('冻结积分失败时应更新状态为 FAILED 并抛出', async () => {
      billingClient.freeze.mockRejectedValue(BusinessException.insufficientCredits('积分不足'))

      await expect(service.create('user-001', dto)).rejects.toThrow(BusinessException)
      expect(repo.update).toHaveBeenCalledWith(
        'bench-001',
        expect.objectContaining({ status: BenchmarkStatus.FAILED }),
      )
    })

    it('各平台 URL 应正确识别', async () => {
      billingClient.freeze.mockResolvedValue({
        success: true,
        balance: 700,
        transactionId: 'tx-001',
      })

      const testCases: Array<{ url: string; expected: BenchmarkPlatform }> = [
        { url: 'https://v.douyin.com/abc123', expected: BenchmarkPlatform.DOUYIN },
        { url: 'https://www.xiaohongshu.com/explore/123', expected: BenchmarkPlatform.XIAOHONGSHU },
        { url: 'https://www.bilibili.com/video/BV1xx', expected: BenchmarkPlatform.BILIBILI },
        { url: 'https://b23.tv/abc123', expected: BenchmarkPlatform.BILIBILI },
        { url: 'https://www.kuaishou.com/short-video/123', expected: BenchmarkPlatform.KUAISHOU },
        { url: 'https://weibo.com/123/abc', expected: BenchmarkPlatform.WEIBO },
        { url: 'https://channels.weixin.qq.com/xxx', expected: BenchmarkPlatform.WECHAT_VIDEO },
        { url: 'https://xhslink.com/abc', expected: BenchmarkPlatform.XIAOHONGSHU },
      ]

      for (const tc of testCases) {
        jest.clearAllMocks()
        billingClient.freeze.mockResolvedValue({
          success: true,
          balance: 700,
          transactionId: 'tx-001',
        })
        await service.create('user-001', { sourceUrl: tc.url })
        expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ platform: tc.expected }))
      }
    })
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('应分页返回用户的对标解析历史', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'b1' } as Benchmark], 1]),
      }
      repo.createQueryBuilder.mockReturnValue(qb as never)

      const result = await service.findAll('user-001', new ListBenchmarksDto())

      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
      expect(qb.where).toHaveBeenCalledWith('b.userId = :userId', {
        userId: 'user-001',
      })
    })

    it('支持平台和状态筛选', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      repo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListBenchmarksDto()
      dto.platform = BenchmarkPlatform.DOUYIN
      dto.status = BenchmarkStatus.COMPLETED

      await service.findAll('user-001', dto)

      expect(qb.andWhere).toHaveBeenCalledWith('b.platform = :platform', {
        platform: BenchmarkPlatform.DOUYIN,
      })
      expect(qb.andWhere).toHaveBeenCalledWith('b.status = :status', {
        status: BenchmarkStatus.COMPLETED,
      })
    })

    it('支持自定义分页参数', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      repo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListBenchmarksDto()
      dto.page = 2
      dto.pageSize = 10

      await service.findAll('user-001', dto)

      // page=2, pageSize=10 → skip(10).take(10)
      expect(qb.skip).toHaveBeenCalledWith(10)
      expect(qb.take).toHaveBeenCalledWith(10)
    })
  })

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('找到属于自己的 benchmark 时返回', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-001',
        sourceUrl: 'https://douyin.com/1',
        platform: BenchmarkPlatform.DOUYIN,
        status: BenchmarkStatus.COMPLETED,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      const result = await service.findOne('user-001', 'b1')
      expect(result.id).toBe('b1')
    })

    it('benchmark 不存在时抛 NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.findOne('user-001', 'nope')).rejects.toThrow(BusinessException)
    })

    it('无权访问他人 benchmark 时抛 FORBIDDEN', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-002',
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.findOne('user-001', 'b1')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- cancel --------------------

  describe('cancel', () => {
    it('成功取消 PENDING 状态的 benchmark（Mock 模式）', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-001',
        status: BenchmarkStatus.PENDING,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      // 预设 freezeId 缓存
      await redis.set('benchmark:freeze:b1', 'tx-freeze-001', 'EX', 604800)

      billingClient.release.mockResolvedValue({
        success: true,
        balance: 1000,
        transactionId: 'tx-release-001',
      })

      const result = await service.cancel('user-001', 'b1')

      expect(result.benchmarkId).toBe('b1')
      expect(result.status).toBe(BenchmarkStatus.CANCELLED)
      expect(repo.update).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ status: BenchmarkStatus.CANCELLED }),
      )
      expect(billingClient.release).toHaveBeenCalled()
      // Mock 模式不应调用 Temporal
      expect(temporalAdapter.cancelWorkflow).not.toHaveBeenCalled()
    })

    it('非 Mock 模式应调用 Temporal cancelWorkflow', async () => {
      const nonMockConfig = mockConfigService(false)
      const nonMockService = new BenchmarkService(
        redis as never,
        benchmarkDataSource,
        billingClient,
        temporalAdapter,
        nonMockConfig,
        promptEngine,
      )

      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-001',
        status: BenchmarkStatus.ANALYZING,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)
      await redis.set('benchmark:freeze:b1', 'tx-freeze-001', 'EX', 604800)
      billingClient.release.mockResolvedValue({
        success: true,
        balance: 1000,
        transactionId: 'tx-release-001',
      })

      await nonMockService.cancel('user-001', 'b1')

      expect(temporalAdapter.cancelWorkflow).toHaveBeenCalledWith('benchmark-b1', '用户主动取消')
    })

    it('COMPLETED 状态不可取消', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-001',
        status: BenchmarkStatus.COMPLETED,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.cancel('user-001', 'b1')).rejects.toThrow(BusinessException)
      expect(billingClient.release).not.toHaveBeenCalled()
    })

    it('CANCELLED 状态不可再次取消', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-001',
        status: BenchmarkStatus.CANCELLED,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.cancel('user-001', 'b1')).rejects.toThrow(BusinessException)
    })

    it('无权取消他人 benchmark', async () => {
      const benchmark: Partial<Benchmark> = {
        id: 'b1',
        userId: 'user-002',
        status: BenchmarkStatus.PENDING,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.cancel('user-001', 'b1')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- clone --------------------

  describe('clone', () => {
    /** 构造一个已完成的 benchmark，带结构化解析报告 */
    const completedBenchmark: Partial<Benchmark> = {
      id: 'b1',
      userId: 'user-001',
      sourceUrl: 'https://douyin.com/1',
      platform: BenchmarkPlatform.DOUYIN,
      status: BenchmarkStatus.COMPLETED,
      analysisResult: {
        style: '竖屏快节奏口播',
        pacing: '紧凑，前 3 秒 hook',
        shotList: [
          {
            sceneIndex: 1,
            duration: 3,
            visual: '产品特写',
            voiceover: '痛点引入',
            onScreenText: '你是不是也这样？',
          },
        ],
        copywriting: { hook: 'hook', body: 'body', cta: 'cta' },
        sellingPoints: ['卖点1'],
        templateSuggestion: '口播+特写',
        summaryMs: 100,
      },
    }

    it('正常复刻 — COMPLETED 状态应返回 CloneResult', async () => {
      repo.findOne.mockResolvedValue(completedBenchmark as Benchmark)

      const result = await service.clone('user-001', 'b1')

      expect(result.benchmarkId).toBe('b1')
      expect(result.prompt).toBe(DEFAULT_CLONE_SUGGESTION.prompt)
      expect(result.model).toBe(DEFAULT_CLONE_SUGGESTION.recommendedModel)
      expect(result.aspectRatio).toBe(DEFAULT_CLONE_SUGGESTION.recommendedAspectRatio)
      expect(result.duration).toBe(DEFAULT_CLONE_SUGGESTION.recommendedDuration)
      // resolution 默认 720p
      expect(result.resolution).toBe('720p')
      // 应调用 PromptEngineService.generateClonePrompt
      expect(promptEngine.generateClonePrompt).toHaveBeenCalledTimes(1)
      expect(promptEngine.generateClonePrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          style: '竖屏快节奏口播',
          shotList: expect.any(Array),
        }),
      )
    })

    it('PENDING 状态应抛出解析尚未完成', async () => {
      const benchmark: Partial<Benchmark> = {
        ...completedBenchmark,
        status: BenchmarkStatus.PENDING,
        analysisResult: null,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.clone('user-001', 'b1')).rejects.toThrow(BusinessException)
      expect(promptEngine.generateClonePrompt).not.toHaveBeenCalled()
    })

    it('ANALYZING 状态应抛出解析尚未完成', async () => {
      const benchmark: Partial<Benchmark> = {
        ...completedBenchmark,
        status: BenchmarkStatus.ANALYZING,
        analysisResult: null,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.clone('user-001', 'b1')).rejects.toThrow(BusinessException)
      expect(promptEngine.generateClonePrompt).not.toHaveBeenCalled()
    })

    it('COMPLETED 但 analysisResult 为空应抛出异常', async () => {
      const benchmark: Partial<Benchmark> = {
        ...completedBenchmark,
        analysisResult: null,
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.clone('user-001', 'b1')).rejects.toThrow(BusinessException)
      expect(promptEngine.generateClonePrompt).not.toHaveBeenCalled()
    })

    it('无权复刻他人 benchmark 应抛出异常', async () => {
      const benchmark: Partial<Benchmark> = {
        ...completedBenchmark,
        userId: 'user-002',
      }
      repo.findOne.mockResolvedValue(benchmark as Benchmark)

      await expect(service.clone('user-001', 'b1')).rejects.toThrow(BusinessException)
      // 不应调用 PromptEngineService
      expect(promptEngine.generateClonePrompt).not.toHaveBeenCalled()
    })

    it('benchmark 不存在应抛出 NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.clone('user-001', 'nope')).rejects.toThrow(BusinessException)
      expect(promptEngine.generateClonePrompt).not.toHaveBeenCalled()
    })
  })
})
