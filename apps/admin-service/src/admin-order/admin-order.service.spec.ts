/**
 * AdminOrderService 单元测试
 *
 * 覆盖：
 *  - findAll：分页 / status 筛选 / userId 筛选 / 时间范围筛选 / 无筛选条件 / 精简字段
 *  - refund：成功 / 订单不存在 / 非 PAID 状态拒绝 / 重复退款拒绝 /
 *           billing 扣回失败（best-effort）/ order-service 退款失败（best-effort）/
 *           套餐不存在时扣回 0 积分
 */
import { BusinessException } from '@reelclone/common'
import {
  Order,
  OrderStatus,
  Package,
  PackageStatus,
  PackageType,
  PaymentMethod,
} from '@reelclone/database'
import { ObjectLiteral, Repository } from 'typeorm'
import { AdminOrderService } from './admin-order.service'
import { ListOrdersDto } from './dto/list-orders.dto'
import { RefundOrderDto } from './dto/refund-order.dto'

// -------------------- Mock 工具 --------------------

/** 模拟 Repository（仅含本服务用到的方法） */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

/** 构造 Mock 订单 */
function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-001',
    userId: 'user-001',
    packageId: 'pkg-001',
    orderNo: 'RC20250101000000123456',
    amount: 9.9,
    status: OrderStatus.PAID,
    paymentMethod: PaymentMethod.WECHAT,
    paidAt: new Date('2025-01-01'),
    cancelledAt: null,
    transactionId: 'wx_tx_001',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as Order
}

/** 构造 Mock 套餐 */
function createMockPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'pkg-001',
    name: '9.9 体验套餐',
    description: '体验套餐',
    price: 9.9,
    originalPrice: 19.9,
    points: 100,
    bonusPoints: 20,
    duration: 30,
    features: ['功能1'],
    type: PackageType.ONE_TIME,
    status: PackageStatus.ACTIVE,
    sort: 0,
    createdAt: new Date('2025-01-01'),
    userPackages: [],
    orders: [],
    ...overrides,
  } as Package
}

/** 构造 Mock fetch Response */
function mockFetchResponse(ok: boolean, body: unknown): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: jest.fn(async () => body),
    text: jest.fn(async () => (typeof body === 'string' ? body : JSON.stringify(body))),
  } as unknown as Response
}

describe('AdminOrderService', () => {
  let service: AdminOrderService
  let orderRepo: jest.Mocked<Repository<Order>>
  let packageRepo: jest.Mocked<Repository<Package>>
  let fetchMock: jest.MockedFunction<typeof fetch>
  const envBackup: Record<string, string | undefined> = {}

  beforeEach(() => {
    orderRepo = mockRepo<Order>()
    packageRepo = mockRepo<Package>()

    // 备份并设置环境变量
    envBackup.BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL
    envBackup.ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL
    envBackup.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY
    process.env.BILLING_SERVICE_URL = 'http://billing-service:3006'
    process.env.ORDER_SERVICE_URL = 'http://order-service:3005'
    process.env.INTERNAL_API_KEY = 'test-internal-key'

    // mock 全局 fetch
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock

    service = new AdminOrderService(orderRepo, packageRepo)
  })

  afterEach(() => {
    jest.clearAllMocks()
    // 恢复环境变量
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    function createQueryBuilderMock() {
      const qb = {
        select: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(),
      }
      return qb
    }

    it('应分页返回订单列表（默认 page=1, pageSize=20）', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[createMockOrder({ id: 'o1' })], 1])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      const result = await service.findAll(dto)

      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
      expect(result.list).toHaveLength(1)
      expect(qb.orderBy).toHaveBeenCalledWith('o.createdAt', 'DESC')
      expect(qb.skip).toHaveBeenCalledWith(0)
      expect(qb.take).toHaveBeenCalledWith(20)
    })

    it('支持 status 筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.status = OrderStatus.PAID

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('o.status = :status', {
        status: OrderStatus.PAID,
      })
    })

    it('支持 userId 筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.userId = 'user-002'

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('o.userId = :userId', {
        userId: 'user-002',
      })
    })

    it('支持 startDate / endDate 时间范围筛选', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.startDate = '2025-01-01'
      dto.endDate = '2025-01-31'

      await service.findAll(dto)

      expect(qb.andWhere).toHaveBeenCalledWith('o.createdAt >= :startDate', {
        startDate: new Date('2025-01-01'),
      })
      expect(qb.andWhere).toHaveBeenCalledWith('o.createdAt <= :endDate', {
        endDate: new Date('2025-01-31'),
      })
    })

    it('分页参数 page=2, pageSize=10 → skip=10', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.page = 2
      dto.pageSize = 10

      await service.findAll(dto)

      expect(qb.skip).toHaveBeenCalledWith(10)
      expect(qb.take).toHaveBeenCalledWith(10)
    })

    it('不传筛选条件时不调用 andWhere', async () => {
      const qb = createQueryBuilderMock()
      qb.getManyAndCount.mockResolvedValue([[], 0])
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()

      await service.findAll(dto)

      expect(qb.andWhere).not.toHaveBeenCalled()
    })
  })

  // -------------------- refund --------------------

  describe('refund', () => {
    const dto = new RefundOrderDto()
    dto.reason = '用户投诉，要求退款'

    it('成功退款：更新状态为 REFUNDED 并调用 billing + order-service', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({
        id: 'pkg-001',
        points: 100,
        bonusPoints: 20,
      })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      expect(result.pointsDeducted).toBe(true)
      expect(result.wechatRefundInitiated).toBe(true)
      expect(orderRepo.save).toHaveBeenCalled()
      // billing deduct + order-service refund 共 2 次 fetch
      expect(fetchMock).toHaveBeenCalledTimes(2)

      // billing deduct 调用：amount = 100 + 20 = 120
      const billingCall = fetchMock.mock.calls[0]
      expect(billingCall[0]).toBe('http://billing-service:3006/api/v1/points/deduct')
      const billingBody = JSON.parse((billingCall[1] as RequestInit).body as string)
      expect(billingBody.amount).toBe(120)
      expect(billingBody.userId).toBe('user-001')
      expect(billingBody.idempotencyKey).toBe('order:o1:refund')

      // order-service refund 调用
      const orderCall = fetchMock.mock.calls[1]
      expect(orderCall[0]).toBe('http://order-service:3005/api/v1/orders/o1/refund')
      const orderBody = JSON.parse((orderCall[1] as RequestInit).body as string)
      expect(orderBody.reason).toBe('用户投诉，要求退款')
    })

    it('订单不存在时抛 NOT_FOUND', async () => {
      orderRepo.findOne.mockResolvedValue(null)

      await expect(service.refund('nope', dto, 'admin-001')).rejects.toThrow(BusinessException)
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('订单状态为 PENDING 时拒绝退款', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PENDING })
      orderRepo.findOne.mockResolvedValue(order)

      await expect(service.refund('o1', dto, 'admin-001')).rejects.toThrow(BusinessException)
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('订单已 REFUNDED 时拒绝重复退款', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED })
      orderRepo.findOne.mockResolvedValue(order)

      await expect(service.refund('o1', dto, 'admin-001')).rejects.toThrow(BusinessException)
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('billing 扣回失败时订单仍为 REFUNDED（best-effort）', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({ points: 100, bonusPoints: 20 })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      // billing 失败
      fetchMock.mockResolvedValueOnce(mockFetchResponse(false, 'billing down'))
      // order-service 成功
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      expect(result.pointsDeducted).toBe(false)
      expect(result.wechatRefundInitiated).toBe(true)
    })

    it('order-service 退款失败时订单仍为 REFUNDED（best-effort）', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({ points: 100, bonusPoints: 20 })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      // billing 成功
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))
      // order-service 失败
      fetchMock.mockResolvedValueOnce(mockFetchResponse(false, 'order-service down'))

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      expect(result.pointsDeducted).toBe(true)
      expect(result.wechatRefundInitiated).toBe(false)
    })

    it('套餐不存在时扣回积分数为 0 但不阻塞退款', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(null)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))
      fetchMock.mockResolvedValueOnce(mockFetchResponse(true, { code: 0 }))

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      const billingBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
      expect(billingBody.amount).toBe(0)
    })
  })
})
