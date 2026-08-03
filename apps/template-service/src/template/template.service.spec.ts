/**
 * TemplateService 单元测试
 *
 * 测试覆盖:
 *  - 列表查询（默认参数 / 筛选 / 排序 / 分页）
 *  - 详情查询（成功 / 不存在）
 *  - 热门排序验证
 *  - 用户上传视频转模板（submitUpload / getUploadStatus / findMyUploaded / internalFinalize / internalFail）
 *  - 模板使用次数 +1 触发积分奖励（含幂等键 / 失败容错）
 */
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  Asset,
  AssetStatus,
  AssetType,
  Template,
  TemplateStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { TemplateService } from './template.service'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { UploadTemplateDto } from './dto/upload-template.dto'
import { BillingClient } from './billing.client'

// -------------------- Mock 工具 --------------------

/** 创建 QueryBuilder Mock（支持 select + update 两种模式） */
function createQueryBuilderMock(): Record<string, jest.Mock> {
  const qb: Record<string, jest.Mock> = {}
  // select 模式链式方法
  qb.andWhere = jest.fn().mockReturnThis()
  qb.orderBy = jest.fn().mockReturnThis()
  qb.skip = jest.fn().mockReturnThis()
  qb.take = jest.fn().mockReturnThis()
  qb.getManyAndCount = jest.fn()
  qb.getOne = jest.fn()
  qb.getMany = jest.fn()
  // update 模式链式方法（B1 修复后 incrementUseCount 使用）
  qb.update = jest.fn().mockReturnThis()
  qb.set = jest.fn().mockReturnThis()
  qb.where = jest.fn().mockReturnThis()
  qb.returning = jest.fn().mockReturnThis()
  qb.execute = jest.fn()
  return qb
}

/** 创建模板 Mock 实体 */
function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    title: '测试模板',
    description: '描述',
    coverKey: 'oss://cover.jpg',
    videoKey: 'oss://video.mp4',
    prompt: '提示词',
    modelConfig: {},
    category: 'category-1',
    industry: '美食',
    platform: 'DOUYIN',
    tags: ['标签1', '标签2'],
    useCount: 100,
    favoriteCount: 50,
    hotScore: 90,
    status: TemplateStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    favorites: [],
    ...overrides,
  } as Template
}

/** 创建资产 Mock 实体 */
function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    userId: 'user-001',
    type: AssetType.VIDEO,
    name: 'test.mp4',
    ossKey: 'oss://test.mp4',
    ossUrl: 'https://oss/test.mp4',
    mimeType: 'video/mp4',
    size: 1024 * 1024 * 10,
    duration: 15,
    thumbnailKey: null,
    avatarGroupId: null,
    status: AssetStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as Asset
}

// -------------------- 测试 --------------------

describe('TemplateService', () => {
  let service: TemplateService
  let repo: jest.Mocked<Repository<Template>>
  let assetRepo: jest.Mocked<Repository<Asset>>
  let billingClient: jest.Mocked<BillingClient>
  let temporalService: jest.Mocked<TemporalService>
  let qb: Record<string, jest.Mock>

  beforeEach(async () => {
    qb = createQueryBuilderMock()
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((entityLike) => ({ ...entityLike }) as Template),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id || 'tmpl-new' } as Template),
      ),
      increment: jest.fn().mockResolvedValue({ generatedMaps: [], raw: [], affected: 1 }),
    } as unknown as jest.Mocked<Repository<Template>>

    assetRepo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Asset>>

    billingClient = {
      reward: jest.fn().mockResolvedValue({ balance: 100, transactionId: 'tx-001' }),
    } as unknown as jest.Mocked<BillingClient>

    temporalService = {
      startTemplateGeneration: jest.fn().mockResolvedValue('wf-001'),
    } as unknown as jest.Mocked<TemporalService>

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'TEMPLATE_REWARD_POINTS') return '5'
        return null
      }),
    } as unknown as ConfigService

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplateService,
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: repo,
        },
        {
          provide: getRepositoryToken(Asset, DATABASE_CONNECTIONS.MAIN),
          useValue: assetRepo,
        },
        { provide: BillingClient, useValue: billingClient },
        { provide: TemporalService, useValue: temporalService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = moduleRef.get(TemplateService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('默认参数: page=1, pageSize=20, sortBy=heat', async () => {
      const mockList = [createMockTemplate()]
      qb.getManyAndCount.mockResolvedValue([mockList, 1])

      const result = await service.findAll(new ListTemplatesDto())

      expect(result).toEqual({
        list: mockList,
        page: 1,
        pageSize: 20,
        total: 1,
      })
      // 应过滤 ACTIVE 状态
      expect(qb.andWhere).toHaveBeenCalledWith('t.status = :status', {
        status: TemplateStatus.ACTIVE,
      })
      // 应按 hotScore 降序
      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC')
      // 应跳过 0 条，取 20 条
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(20)
    })

    it('分页: page=3, pageSize=10', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.page = 3
      dto.pageSize = 10

      await service.findAll(dto)

      // skip = (3-1) * 10 = 20
      expect(qb.skip).toHaveBeenCalledWith(20)
      expect(qb.take).toHaveBeenCalledWith(10)
    })

    it('平台筛选: platform=DOUYIN', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.platform = 'DOUYIN'

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('t.platform = :platform', {
        platform: 'DOUYIN',
      })
    })

    it('行业筛选: industry=美食', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.industry = '美食'

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('t.industry = :industry', {
        industry: '美食',
      })
    })

    it('关键词筛选: keyword=测试', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.keyword = '测试'

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('t.title ILIKE :keyword', {
        keyword: '%测试%',
      })
    })

    it('排序: sortBy=latest', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.sortBy = 'latest'

      await service.findAll(dto)

      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC')
    })

    it('排序: sortBy=iq (回退到 hotScore)', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.sortBy = 'iq'

      await service.findAll(dto)

      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC')
    })

    it('排序: sortBy=heat (默认热度排序)', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0])

      const dto = new ListTemplatesDto()
      dto.sortBy = 'heat'

      await service.findAll(dto)

      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC')
    })

    it('多条件组合筛选', async () => {
      const mockList = [createMockTemplate({ id: 'combo-1' })]
      qb.getManyAndCount.mockResolvedValue([mockList, 1])

      const dto = new ListTemplatesDto()
      dto.page = 2
      dto.pageSize = 5
      dto.platform = 'XIAOHONGSHU'
      dto.industry = '美妆'
      dto.keyword = '口红'
      dto.sortBy = 'latest'

      const result = await service.findAll(dto)

      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(2)
      expect(result.pageSize).toBe(5)
      expect(result.total).toBe(1)
      expect(qb.andWhere).toHaveBeenCalledWith('t.platform = :platform', {
        platform: 'XIAOHONGSHU',
      })
      expect(qb.andWhere).toHaveBeenCalledWith('t.industry = :industry', {
        industry: '美妆',
      })
      expect(qb.andWhere).toHaveBeenCalledWith('t.title ILIKE :keyword', {
        keyword: '%口红%',
      })
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC')
      expect(qb.skip).toHaveBeenCalledWith(5)
      expect(qb.take).toHaveBeenCalledWith(5)
    })
  })

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('模板存在时返回详情', async () => {
      const mockTemplate = createMockTemplate({ id: 'found-1' })
      repo.findOne.mockResolvedValue(mockTemplate)

      const result = await service.findOne('found-1')

      expect(result).toBe(mockTemplate)
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'found-1', status: TemplateStatus.ACTIVE },
      })
    })

    it('模板不存在时抛出 NOT_FOUND 异常', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.findOne('not-exist')).rejects.toThrow(BusinessException)

      try {
        await service.findOne('not-exist')
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
        expect((e as BusinessException).message).toContain('模板')
      }
    })
  })

  // -------------------- submitUpload --------------------

  describe('submitUpload', () => {
    const validDto: UploadTemplateDto = {
      assetId: 'asset-001',
      title: '我的测试模板',
      description: '描述',
      category: '美食',
      industry: '餐饮',
      platform: 'DOUYIN',
      tags: ['标签1'],
    }

    it('成功提交：创建 ANALYZING 模板 + 启动工作流 + 回填 workflowId', async () => {
      const mockAsset = createMockAsset({ id: 'asset-001', duration: 15 })
      assetRepo.findOne.mockResolvedValue(mockAsset)
      // 第一次 save（创建模板），第二次 save（回填 workflowId）
      repo.save
        .mockResolvedValueOnce({
          ...createMockTemplate(),
          id: 'tmpl-new',
          status: TemplateStatus.ANALYZING,
        } as Template)
        .mockResolvedValueOnce({
          ...createMockTemplate(),
          id: 'tmpl-new',
          status: TemplateStatus.ANALYZING,
          workflowId: 'wf-001',
        } as Template)

      const result = await service.submitUpload('user-001', validDto)

      // 校验资产查询参数
      expect(assetRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'asset-001', userId: 'user-001', status: AssetStatus.ACTIVE },
      })

      // 校验 Temporal 工作流启动参数
      expect(temporalService.startTemplateGeneration).toHaveBeenCalledWith({
        templateId: 'tmpl-new',
        userId: 'user-001',
        ossKey: 'oss://test.mp4',
        title: '我的测试模板',
      })

      // 校验返回值
      expect(result).toEqual({
        templateId: 'tmpl-new',
        workflowId: 'wf-001',
        status: TemplateStatus.ANALYZING,
      })
    })

    it('资产不存在时抛出 NOT_FOUND', async () => {
      assetRepo.findOne.mockResolvedValue(null)

      await expect(service.submitUpload('user-001', validDto)).rejects.toThrow(BusinessException)
      expect(temporalService.startTemplateGeneration).not.toHaveBeenCalled()
    })

    it('资产类型不是 VIDEO 时抛出 VALIDATION_ERROR', async () => {
      const mockAsset = createMockAsset({ type: AssetType.IMAGE })
      assetRepo.findOne.mockResolvedValue(mockAsset)

      await expect(service.submitUpload('user-001', validDto)).rejects.toThrow(BusinessException)
      try {
        await service.submitUpload('user-001', validDto)
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
      }
      expect(temporalService.startTemplateGeneration).not.toHaveBeenCalled()
    })

    it('视频时长 < 3 秒时抛出 VALIDATION_ERROR', async () => {
      const mockAsset = createMockAsset({ duration: 2 })
      assetRepo.findOne.mockResolvedValue(mockAsset)

      await expect(service.submitUpload('user-001', validDto)).rejects.toThrow(BusinessException)
      try {
        await service.submitUpload('user-001', validDto)
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
        expect((e as BusinessException).message).toContain('3-60')
      }
    })

    it('视频时长 > 60 秒时抛出 VALIDATION_ERROR', async () => {
      const mockAsset = createMockAsset({ duration: 90 })
      assetRepo.findOne.mockResolvedValue(mockAsset)

      await expect(service.submitUpload('user-001', validDto)).rejects.toThrow(BusinessException)
    })

    it('Temporal 工作流启动失败时：标记 ANALYSIS_FAILED + 抛出 INTERNAL_ERROR', async () => {
      const mockAsset = createMockAsset({ duration: 15 })
      assetRepo.findOne.mockResolvedValue(mockAsset)
      temporalService.startTemplateGeneration.mockRejectedValue(new Error('Temporal 不可用'))
      repo.save.mockResolvedValue({
        ...createMockTemplate(),
        status: TemplateStatus.ANALYSIS_FAILED,
      } as Template)

      try {
        await service.submitUpload('user-001', validDto)
        // 不应该走到这里
        expect(true).toBe(false)
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).code).toBe(ErrorCode.INTERNAL_ERROR)
      }

      // 应该有 2 次 save：第一次创建模板，第二次标记为 ANALYSIS_FAILED
      expect(repo.save).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------- getUploadStatus --------------------

  describe('getUploadStatus', () => {
    it('正常返回状态', async () => {
      const mockTemplate = createMockTemplate({
        id: 'tmpl-001',
        userId: 'user-001',
        workflowId: 'wf-001',
        status: TemplateStatus.ANALYZING,
        failureReason: null,
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      const result = await service.getUploadStatus('wf-001', 'user-001')

      expect(result).toEqual({
        templateId: 'tmpl-001',
        workflowId: 'wf-001',
        status: TemplateStatus.ANALYZING,
        failureReason: null,
      })
    })

    it('模板不存在时抛出 NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(service.getUploadStatus('wf-not-exist', 'user-001')).rejects.toThrow(
        BusinessException,
      )
    })

    it('非本人模板时抛出 FORBIDDEN', async () => {
      const mockTemplate = createMockTemplate({
        userId: 'user-002',
        workflowId: 'wf-001',
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      await expect(service.getUploadStatus('wf-001', 'user-001')).rejects.toThrow(BusinessException)
      try {
        await service.getUploadStatus('wf-001', 'user-001')
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.FORBIDDEN)
      }
    })

    it('分析失败状态应返回 failureReason', async () => {
      const mockTemplate = createMockTemplate({
        userId: 'user-001',
        workflowId: 'wf-001',
        status: TemplateStatus.ANALYSIS_FAILED,
        failureReason: 'LLM 调用超时',
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      const result = await service.getUploadStatus('wf-001', 'user-001')

      expect(result.status).toBe(TemplateStatus.ANALYSIS_FAILED)
      expect(result.failureReason).toBe('LLM 调用超时')
    })
  })

  // -------------------- findMyUploaded --------------------

  describe('findMyUploaded', () => {
    it('查询我上传的模板列表', async () => {
      const mockList = [createMockTemplate({ id: 'upload-1', userId: 'user-001' })]
      qb.getManyAndCount.mockResolvedValue([mockList, 1])

      const result = await service.findMyUploaded('user-001', 1, 20)

      expect(result).toEqual({
        list: mockList,
        page: 1,
        pageSize: 20,
        total: 1,
      })
      // 应过滤 userId
      expect(qb.andWhere).toHaveBeenCalledWith('t.userId = :userId', {
        userId: 'user-001',
      })
      // 应过滤 sourceAssetId 非空
      expect(qb.andWhere).toHaveBeenCalledWith('t.sourceAssetId IS NOT NULL')
      // 应按 createdAt 倒序
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC')
    })
  })

  // -------------------- internalFinalize --------------------

  describe('internalFinalize', () => {
    it('成功完成模板：状态 ANALYZING → ACTIVE + 写入元数据', async () => {
      const mockTemplate = createMockTemplate({
        id: 'tmpl-001',
        status: TemplateStatus.ANALYZING,
      })
      repo.findOne.mockResolvedValue(mockTemplate)
      repo.save.mockResolvedValue({
        ...mockTemplate,
        status: TemplateStatus.ACTIVE,
      } as Template)

      const result = await service.internalFinalize({
        templateId: 'tmpl-001',
        meta: { duration: 15, width: 1080 },
        analysisReport: { shots: 3 },
        templateSuggestion: { prompt: '生成的提示词' },
        coverKey: 'oss://cover.jpg',
      })

      expect(result.status).toBe(TemplateStatus.ACTIVE)
      expect(mockTemplate.videoMeta).toEqual({ duration: 15, width: 1080 })
      expect(mockTemplate.analysisReport).toEqual({ shots: 3 })
      expect(mockTemplate.modelConfig).toEqual({ prompt: '生成的提示词' })
      expect(mockTemplate.coverKey).toBe('oss://cover.jpg')
      expect(mockTemplate.failureReason).toBeNull()
    })

    it('模板不存在时抛出 NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(
        service.internalFinalize({
          templateId: 'not-exist',
          meta: {},
          analysisReport: {},
          templateSuggestion: {},
          coverKey: 'cover',
        }),
      ).rejects.toThrow(BusinessException)
    })

    it('已是 ACTIVE 状态时幂等返回（不再写入）', async () => {
      const mockTemplate = createMockTemplate({
        status: TemplateStatus.ACTIVE,
        videoMeta: { existing: true },
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      const result = await service.internalFinalize({
        templateId: 'tmpl-001',
        meta: { new: true },
        analysisReport: {},
        templateSuggestion: {},
        coverKey: 'new-cover',
      })

      expect(result).toBe(mockTemplate)
      // 不应再调用 save
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('状态非 ANALYZING 时抛出 VALIDATION_ERROR', async () => {
      const mockTemplate = createMockTemplate({
        status: TemplateStatus.PENDING_REVIEW,
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      await expect(
        service.internalFinalize({
          templateId: 'tmpl-001',
          meta: {},
          analysisReport: {},
          templateSuggestion: {},
          coverKey: 'cover',
        }),
      ).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- internalFail --------------------

  describe('internalFail', () => {
    it('成功标记失败：状态 ANALYZING → ANALYSIS_FAILED + 写入失败原因', async () => {
      const mockTemplate = createMockTemplate({
        status: TemplateStatus.ANALYZING,
      })
      repo.findOne.mockResolvedValue(mockTemplate)
      repo.save.mockResolvedValue({
        ...mockTemplate,
        status: TemplateStatus.ANALYSIS_FAILED,
      } as Template)

      const result = await service.internalFail({
        templateId: 'tmpl-001',
        reason: '视频下载失败',
      })

      expect(result.status).toBe(TemplateStatus.ANALYSIS_FAILED)
      expect(mockTemplate.failureReason).toBe('视频下载失败')
    })

    it('已是 ANALYSIS_FAILED 状态时幂等返回', async () => {
      const mockTemplate = createMockTemplate({
        status: TemplateStatus.ANALYSIS_FAILED,
        failureReason: '已记录的原因',
      })
      repo.findOne.mockResolvedValue(mockTemplate)

      const result = await service.internalFail({
        templateId: 'tmpl-001',
        reason: '新的原因',
      })

      expect(result).toBe(mockTemplate)
      expect(repo.save).not.toHaveBeenCalled()
    })

    it('模板不存在时抛出 NOT_FOUND', async () => {
      repo.findOne.mockResolvedValue(null)

      await expect(
        service.internalFail({ templateId: 'not-exist', reason: '失败' }),
      ).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- incrementUseCount (含积分奖励) --------------------

  describe('incrementUseCount', () => {
    /** 辅助：mock 原子自增返回结果 */
    function mockIncrementResult(useCountAfter: number, userId: string | null) {
      qb.execute.mockResolvedValue({
        affected: 1,
        raw: [{ useCount: useCountAfter, userId }],
        generatedMaps: [],
      })
    }

    it('成功 +1 + 触发积分奖励（用户上传的模板，幂等键用自增后的 useCount）', async () => {
      // 自增后 useCount=11（自增前 10），userId='user-001'
      mockIncrementResult(11, 'user-001')

      await service.incrementUseCount('tmpl-001')

      // 应使用原子自增 + returning
      expect(qb.update).toHaveBeenCalledWith(Template)
      expect(qb.set).toHaveBeenCalled()
      expect(qb.returning).toHaveBeenCalledWith(['useCount', 'userId'])
      expect(qb.execute).toHaveBeenCalled()
      // 应调用积分奖励，幂等键使用自增后的 useCount=11（B1 修复：消除竞态）
      expect(billingClient.reward).toHaveBeenCalledWith({
        userId: 'user-001',
        amount: 5, // 来自 configService TEMPLATE_REWARD_POINTS
        templateId: 'tmpl-001',
        idempotencyKey: 'reward:template:tmpl-001:use:11',
        description: 'template:reward:tmpl-001:use:11',
      })
    })

    it('运营录入的模板（userId=null）不触发积分奖励', async () => {
      mockIncrementResult(6, null)

      await service.incrementUseCount('tmpl-001')

      expect(qb.execute).toHaveBeenCalled()
      expect(billingClient.reward).not.toHaveBeenCalled()
    })

    it('模板不存在时（affected=0）抛出 NOT_FOUND', async () => {
      qb.execute.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] })

      await expect(service.incrementUseCount('not-exist')).rejects.toThrow(BusinessException)
      expect(billingClient.reward).not.toHaveBeenCalled()
    })

    it('积分奖励失败时不影响主流程（useCount 已自增）', async () => {
      mockIncrementResult(1, 'user-001')
      billingClient.reward.mockRejectedValue(new Error('billing 不可用'))

      // 不应抛出异常
      await expect(service.incrementUseCount('tmpl-001')).resolves.toBeUndefined()

      // useCount 应已自增（execute 已调用）
      expect(qb.execute).toHaveBeenCalled()
      // 应尝试调用积分奖励
      expect(billingClient.reward).toHaveBeenCalled()
    })

    it('幂等键随 useCount 变化（每次使用唯一，B1 消除竞态）', async () => {
      // 第一次使用：自增后 useCount=1，幂等键 use:1
      mockIncrementResult(1, 'user-001')
      await service.incrementUseCount('tmpl-001')

      // 第二次使用：自增后 useCount=2，幂等键 use:2
      mockIncrementResult(2, 'user-001')
      await service.incrementUseCount('tmpl-001')

      // 两次幂等键应不同（自增后的值单调递增）
      const call1 = billingClient.reward.mock.calls[0][0]
      const call2 = billingClient.reward.mock.calls[1][0]
      expect(call1.idempotencyKey).toBe('reward:template:tmpl-001:use:1')
      expect(call2.idempotencyKey).toBe('reward:template:tmpl-001:use:2')
    })
  })
})
