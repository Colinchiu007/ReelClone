/**
 * AdminContentService 单元测试
 *
 * 测试覆盖：
 *  - listWorks: 分页 + status/userId/startDate/endDate 筛选
 *  - takedownWork: 成功下架 / 作品不存在 / 通知失败不影响下架
 *  - listTemplates: 返回全部模板 / 空列表
 *  - updateTemplateStatus: 上架 / 下架 / 模板不存在
 */
jest.mock('axios')
import axios from 'axios'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { ErrorCode } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  Template,
  TemplateStatus,
  Work,
  WorkStatus,
} from '@reelclone/database'
import { AdminContentService } from './admin-content.service'
import { ListWorksDto } from './dto/list-works.dto'

// -------------------- Mock 工具 --------------------

/**
 * 构造 TypeORM QueryBuilder 风格的 mock。
 * 链式方法（select/where/andWhere/orderBy/skip/take）返回自身，
 * 终端方法 getManyAndCount 可在测试中 mockResolvedValueOnce。
 */
interface MockQueryBuilder<T> {
  select: jest.Mock<MockQueryBuilder<T>, unknown[]>
  where: jest.Mock<MockQueryBuilder<T>, unknown[]>
  andWhere: jest.Mock<MockQueryBuilder<T>, unknown[]>
  orderBy: jest.Mock<MockQueryBuilder<T>, unknown[]>
  skip: jest.Mock<MockQueryBuilder<T>, unknown[]>
  take: jest.Mock<MockQueryBuilder<T>, unknown[]>
  getManyAndCount: jest.Mock<Promise<[T[], number]>, unknown[]>
}

function createQueryBuilderMock<T>(): MockQueryBuilder<T> {
  const chain = {} as MockQueryBuilder<T>
  ;(['select', 'where', 'andWhere', 'orderBy', 'skip', 'take'] as const).forEach((m) => {
    chain[m] = jest.fn().mockReturnValue(chain)
  })
  chain.getManyAndCount = jest.fn().mockResolvedValue([[], 0] as [T[], number])
  return chain
}

// -------------------- 测试 --------------------

describe('AdminContentService', () => {
  let service: AdminContentService
  let workRepo: jest.Mocked<Repository<Work>>
  let templateRepo: jest.Mocked<Repository<Template>>
  let axiosPost: jest.MockedFunction<typeof axios.post>

  beforeEach(async () => {
    workRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Work>>

    templateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Template>>

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminContentService,
        {
          provide: getRepositoryToken(Work, DATABASE_CONNECTIONS.MAIN),
          useValue: workRepo,
        },
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: templateRepo,
        },
      ],
    }).compile()

    service = module.get(AdminContentService)
    axiosPost = axios.post as jest.MockedFunction<typeof axios.post>
    axiosPost.mockResolvedValue({ data: {} } as never)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- listWorks --------------------

  describe('listWorks', () => {
    it('默认参数: page=1, pageSize=20, 按 createdAt 降序', async () => {
      const mockWorks = [{ id: 'w1' }] as Work[]
      const qb = createQueryBuilderMock<Work>()
      qb.getManyAndCount.mockResolvedValueOnce([mockWorks, 1])
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const result = await service.listWorks(new ListWorksDto())

      expect(qb.select).toHaveBeenCalledWith([
        'w.id',
        'w.title',
        'w.type',
        'w.status',
        'w.userId',
        'w.createdAt',
      ])
      expect(qb.orderBy).toHaveBeenCalledWith('w.created_at', 'DESC')
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(20)
      expect(qb.andWhere).not.toHaveBeenCalled()
      expect(result.list).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
    })

    it('按 status 筛选', async () => {
      const qb = createQueryBuilderMock<Work>()
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const dto = new ListWorksDto()
      dto.status = WorkStatus.COMPLETED
      await service.listWorks(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('w.status = :status', {
        status: WorkStatus.COMPLETED,
      })
    })

    it('按 userId 筛选', async () => {
      const qb = createQueryBuilderMock<Work>()
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const dto = new ListWorksDto()
      dto.userId = 'user-123'
      await service.listWorks(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('w.user_id = :userId', {
        userId: 'user-123',
      })
    })

    it('按 startDate/endDate 筛选', async () => {
      const qb = createQueryBuilderMock<Work>()
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const dto = new ListWorksDto()
      dto.startDate = '2025-01-01'
      dto.endDate = '2025-12-31'
      await service.listWorks(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('w.created_at >= :startDate', {
        startDate: '2025-01-01',
      })
      expect(qb.andWhere).toHaveBeenCalledWith('w.created_at <= :endDate', {
        endDate: '2025-12-31',
      })
    })

    it('分页: page=2, pageSize=10 → skip=10', async () => {
      const qb = createQueryBuilderMock<Work>()
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const dto = new ListWorksDto()
      dto.page = 2
      dto.pageSize = 10
      await service.listWorks(dto)

      expect(qb.skip).toHaveBeenCalledWith(10)
      expect(qb.take).toHaveBeenCalledWith(10)
    })

    it('多条件组合筛选', async () => {
      const qb = createQueryBuilderMock<Work>()
      workRepo.createQueryBuilder.mockReturnValue(qb as unknown as never)

      const dto = new ListWorksDto()
      dto.status = WorkStatus.COMPLETED
      dto.userId = 'u1'
      dto.startDate = '2025-01-01'
      dto.endDate = '2025-12-31'
      await service.listWorks(dto)

      expect(qb.andWhere).toHaveBeenCalledTimes(4)
    })
  })

  // -------------------- takedownWork --------------------

  describe('takedownWork', () => {
    it('成功: 将状态改为 CANCELLED, 调用 save, 发送通知', async () => {
      const work = {
        id: 'w1',
        userId: 'u1',
        status: WorkStatus.COMPLETED,
      } as Work
      workRepo.findOne.mockResolvedValueOnce(work)
      workRepo.save.mockResolvedValueOnce(work)

      const result = await service.takedownWork('w1', { reason: '违规内容' }, 'admin1')

      expect(workRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'w1' },
      })
      expect(work.status).toBe(WorkStatus.CANCELLED)
      expect(workRepo.save).toHaveBeenCalledWith(work)
      expect(axiosPost).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/notifications/system'),
        expect.objectContaining({
          userId: 'u1',
          title: '作品下架通知',
        }),
        expect.objectContaining({ timeout: 5000 }),
      )
      expect(result).toEqual({
        id: 'w1',
        status: WorkStatus.CANCELLED,
      })
    })

    it('作品不存在 → 抛 NOT_FOUND', async () => {
      workRepo.findOne.mockResolvedValueOnce(null)

      await expect(
        service.takedownWork('missing', { reason: '违规' }, 'admin1'),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
    })

    it('通知失败不影响下架操作', async () => {
      const work = {
        id: 'w1',
        userId: 'u1',
        status: WorkStatus.COMPLETED,
      } as Work
      workRepo.findOne.mockResolvedValueOnce(work)
      workRepo.save.mockResolvedValueOnce(work)
      axiosPost.mockRejectedValueOnce(new Error('connection refused'))

      const result = await service.takedownWork('w1', { reason: '违规' }, 'admin1')

      expect(result).toEqual({
        id: 'w1',
        status: WorkStatus.CANCELLED,
      })
    })
  })

  // -------------------- listTemplates --------------------

  describe('listTemplates', () => {
    it('返回所有模板, 按 createdAt 降序', async () => {
      const mockTemplates = [{ id: 't1' }, { id: 't2' }] as Template[]
      templateRepo.find.mockResolvedValueOnce(mockTemplates)

      const result = await service.listTemplates()

      expect(templateRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      })
      expect(result).toHaveLength(2)
    })

    it('无模板时返回空数组', async () => {
      templateRepo.find.mockResolvedValueOnce([])

      const result = await service.listTemplates()

      expect(result).toEqual([])
    })
  })

  // -------------------- updateTemplateStatus --------------------

  describe('updateTemplateStatus', () => {
    it('上架: 将状态改为 ACTIVE', async () => {
      const template = {
        id: 't1',
        status: TemplateStatus.OFFLINE,
      } as Template
      templateRepo.findOne.mockResolvedValueOnce(template)
      templateRepo.save.mockResolvedValueOnce(template)

      const result = await service.updateTemplateStatus(
        't1',
        { status: TemplateStatus.ACTIVE },
        'admin1',
      )

      expect(templateRepo.findOne).toHaveBeenCalledWith({
        where: { id: 't1' },
      })
      expect(template.status).toBe(TemplateStatus.ACTIVE)
      expect(templateRepo.save).toHaveBeenCalledWith(template)
      expect(result).toEqual({
        id: 't1',
        status: TemplateStatus.ACTIVE,
      })
    })

    it('下架: 将状态改为 OFFLINE', async () => {
      const template = {
        id: 't1',
        status: TemplateStatus.ACTIVE,
      } as Template
      templateRepo.findOne.mockResolvedValueOnce(template)
      templateRepo.save.mockResolvedValueOnce(template)

      const result = await service.updateTemplateStatus(
        't1',
        { status: TemplateStatus.OFFLINE },
        'admin1',
      )

      expect(template.status).toBe(TemplateStatus.OFFLINE)
      expect(result).toEqual({
        id: 't1',
        status: TemplateStatus.OFFLINE,
      })
    })

    it('模板不存在 → 抛 NOT_FOUND', async () => {
      templateRepo.findOne.mockResolvedValueOnce(null)

      await expect(
        service.updateTemplateStatus('missing', { status: TemplateStatus.ACTIVE }, 'admin1'),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
    })
  })
})
