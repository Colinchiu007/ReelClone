/**
 * AdminStatsService 单元测试
 *
 * 测试范围：
 * - getOverview：7d / 30d 时间范围计算 / DAU / 新增用户 / GMV / 生成量 / 积分消耗 / 趋势填充
 * - getPointsFlow：分页 / userId 筛选 / 时间范围筛选 / 字段映射（description -> source）
 */
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ObjectLiteral, Repository } from 'typeorm'
import { AdminStatsService } from './admin-stats.service'
import { OverviewQueryDto } from './dto/overview-query.dto'
import { PointsFlowQueryDto } from './dto/points-flow-query.dto'
import {
  DATABASE_CONNECTIONS,
  Order,
  PointTransaction,
  PointTransactionType,
  User,
  Work,
} from '@reelclone/database'

// -------------------- Mock 工厂 --------------------

function createQueryBuilderMock() {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
    getManyAndCount: jest.fn(),
  }
  return qb
}

function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

describe('AdminStatsService', () => {
  let service: AdminStatsService
  let userRepo: jest.Mocked<Repository<User>>
  let workRepo: jest.Mocked<Repository<Work>>
  let orderRepo: jest.Mocked<Repository<Order>>
  let pointTxRepo: jest.Mocked<Repository<PointTransaction>>

  beforeEach(async () => {
    userRepo = mockRepo<User>()
    workRepo = mockRepo<Work>()
    orderRepo = mockRepo<Order>()
    pointTxRepo = mockRepo<PointTransaction>()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminStatsService,
        {
          provide: getRepositoryToken(User, DATABASE_CONNECTIONS.MAIN),
          useValue: userRepo,
        },
        {
          provide: getRepositoryToken(Work, DATABASE_CONNECTIONS.MAIN),
          useValue: workRepo,
        },
        {
          provide: getRepositoryToken(Order, DATABASE_CONNECTIONS.MAIN),
          useValue: orderRepo,
        },
        {
          provide: getRepositoryToken(PointTransaction, DATABASE_CONNECTIONS.BILLING),
          useValue: pointTxRepo,
        },
      ],
    }).compile()

    service = module.get<AdminStatsService>(AdminStatsService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- getOverview --------------------

  describe('getOverview', () => {
    it('7d 范围：应返回各项指标 + 7 天趋势', async () => {
      const userQb1 = createQueryBuilderMock() // DAU count
      userQb1.getCount.mockResolvedValue(10)
      const userQb2 = createQueryBuilderMock() // newUsers count
      userQb2.getCount.mockResolvedValue(25)
      const userDauTrendQb = createQueryBuilderMock()
      userDauTrendQb.getRawMany.mockResolvedValue([{ day: todayLabel(), count: 10 }])
      const userNewTrendQb = createQueryBuilderMock()
      userNewTrendQb.getRawMany.mockResolvedValue([{ day: todayLabel(), count: 5 }])
      ;(userRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(userQb1)
        .mockReturnValueOnce(userQb2)
        .mockReturnValueOnce(userDauTrendQb)
        .mockReturnValueOnce(userNewTrendQb)

      const workQb = createQueryBuilderMock()
      workQb.getCount.mockResolvedValue(120)
      ;(workRepo.createQueryBuilder as jest.Mock).mockReturnValue(workQb)

      const orderGmvQb = createQueryBuilderMock()
      orderGmvQb.getRawOne.mockResolvedValue({ total: 999.9 })
      const orderTrendQb = createQueryBuilderMock()
      orderTrendQb.getRawMany.mockResolvedValue([{ day: todayLabel(), total: 333.3 }])
      ;(orderRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(orderGmvQb)
        .mockReturnValueOnce(orderTrendQb)

      const pointsQb = createQueryBuilderMock()
      pointsQb.getRawOne.mockResolvedValue({ total: -450 })
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(pointsQb)

      const dto = new OverviewQueryDto()
      const result = await service.getOverview(dto)

      expect(result.dau).toBe(10)
      expect(result.newUsers).toBe(25)
      expect(result.gmv).toBe(999.9)
      expect(result.generationCount).toBe(120)
      expect(result.pointsConsumed).toBe(450)
      expect(result.trends.dates).toHaveLength(7)
      expect(result.trends.dau).toHaveLength(7)
      expect(result.trends.newUsers).toHaveLength(7)
      expect(result.trends.gmv).toHaveLength(7)
      // 当天有数据，最后一个元素应为聚合值
      expect(result.trends.dau[6]).toBe(10)
      expect(result.trends.newUsers[6]).toBe(5)
      expect(result.trends.gmv[6]).toBe(333.3)
      // 缺失天补 0
      expect(result.trends.dau[0]).toBe(0)
    })

    it('30d 范围：趋势应为 30 天', async () => {
      const userQb1 = createQueryBuilderMock()
      userQb1.getCount.mockResolvedValue(1)
      const userQb2 = createQueryBuilderMock()
      userQb2.getCount.mockResolvedValue(2)
      const userDauTrendQb = createQueryBuilderMock()
      userDauTrendQb.getRawMany.mockResolvedValue([])
      const userNewTrendQb = createQueryBuilderMock()
      userNewTrendQb.getRawMany.mockResolvedValue([])
      ;(userRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(userQb1)
        .mockReturnValueOnce(userQb2)
        .mockReturnValueOnce(userDauTrendQb)
        .mockReturnValueOnce(userNewTrendQb)

      const workQb = createQueryBuilderMock()
      workQb.getCount.mockResolvedValue(0)
      ;(workRepo.createQueryBuilder as jest.Mock).mockReturnValue(workQb)

      const orderGmvQb = createQueryBuilderMock()
      orderGmvQb.getRawOne.mockResolvedValue({ total: 0 })
      const orderTrendQb = createQueryBuilderMock()
      orderTrendQb.getRawMany.mockResolvedValue([])
      ;(orderRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(orderGmvQb)
        .mockReturnValueOnce(orderTrendQb)

      const pointsQb = createQueryBuilderMock()
      pointsQb.getRawOne.mockResolvedValue({ total: 0 })
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(pointsQb)

      const dto = new OverviewQueryDto()
      dto.range = '30d'
      const result = await service.getOverview(dto)

      expect(result.trends.dates).toHaveLength(30)
      expect(result.trends.dau.every((v) => v === 0)).toBe(true)
    })

    it('GMV / 积分消耗为空时返回 0（COALESCE 容错）', async () => {
      const userQb1 = createQueryBuilderMock()
      userQb1.getCount.mockResolvedValue(0)
      const userQb2 = createQueryBuilderMock()
      userQb2.getCount.mockResolvedValue(0)
      const userDauTrendQb = createQueryBuilderMock()
      userDauTrendQb.getRawMany.mockResolvedValue([])
      const userNewTrendQb = createQueryBuilderMock()
      userNewTrendQb.getRawMany.mockResolvedValue([])
      ;(userRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(userQb1)
        .mockReturnValueOnce(userQb2)
        .mockReturnValueOnce(userDauTrendQb)
        .mockReturnValueOnce(userNewTrendQb)

      const workQb = createQueryBuilderMock()
      workQb.getCount.mockResolvedValue(0)
      ;(workRepo.createQueryBuilder as jest.Mock).mockReturnValue(workQb)

      const orderGmvQb = createQueryBuilderMock()
      orderGmvQb.getRawOne.mockResolvedValue({ total: null })
      const orderTrendQb = createQueryBuilderMock()
      orderTrendQb.getRawMany.mockResolvedValue([])
      ;(orderRepo.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(orderGmvQb)
        .mockReturnValueOnce(orderTrendQb)

      const pointsQb = createQueryBuilderMock()
      pointsQb.getRawOne.mockResolvedValue({ total: null })
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(pointsQb)

      const dto = new OverviewQueryDto()
      const result = await service.getOverview(dto)

      expect(result.gmv).toBe(0)
      expect(result.pointsConsumed).toBe(0)
    })
  })

  // -------------------- getPointsFlow --------------------

  describe('getPointsFlow', () => {
    it('应分页返回积分流水，并将 description 映射为 source', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'tx-1',
            userId: 'user-1',
            type: PointTransactionType.CONSUME,
            amount: -10,
            balance: 90,
            description: '生成视频扣费',
            createdAt: new Date('2026-07-29'),
          },
        ],
        1,
      ])
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new PointsFlowQueryDto()
      const result = await service.getPointsFlow(dto)

      expect(result.list).toHaveLength(1)
      expect(result.list[0].id).toBe('tx-1')
      expect(result.list[0].source).toBe('生成视频扣费')
      expect(result.list[0].type).toBe(PointTransactionType.CONSUME)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
      expect(qb.orderBy).toHaveBeenCalledWith('tx.createdAt', 'DESC')
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(20)
    })

    it('应支持 userId 筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new PointsFlowQueryDto()
      dto.userId = 'user-123'
      await service.getPointsFlow(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('tx.userId = :userId', {
        userId: 'user-123',
      })
    })

    it('应支持 startDate / endDate 时间范围筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new PointsFlowQueryDto()
      dto.startDate = '2026-07-01'
      dto.endDate = '2026-07-31'
      await service.getPointsFlow(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('tx.createdAt >= :startDate', {
        startDate: new Date('2026-07-01'),
      })
      expect(qb.andWhere).toHaveBeenCalledWith('tx.createdAt <= :endDate', {
        endDate: new Date('2026-07-31'),
      })
    })

    it('不传筛选条件时不调用 andWhere', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new PointsFlowQueryDto()
      await service.getPointsFlow(dto)

      expect(qb.andWhere).not.toHaveBeenCalled()
    })

    it('page=3, pageSize=10 → skip=20', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      ;(pointTxRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb)

      const dto = new PointsFlowQueryDto()
      dto.page = 3
      dto.pageSize = 10
      await service.getPointsFlow(dto)

      expect(qb.skip).toHaveBeenCalledWith(20)
      expect(qb.take).toHaveBeenCalledWith(10)
    })
  })
})

// -------------------- 工具函数 --------------------

/** 返回今天 00:00 的日期标签（YYYY-MM-DD） */
function todayLabel(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
