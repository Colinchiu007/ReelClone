/**
 * AdminOrderService 单元测试
 *
 * 覆盖：
 *  - findAll：分页 / status 筛选 / userId 筛选 / 时间范围筛选 / 无筛选条件 / 精简字段
 *  - refund（修复版：先下游后状态）：
 *    - 成功退款（微信退款 + 扣积分 + 标记 REFUNDED）
 *    - 订单不存在 / 非 PAID 拒绝 / 重复退款拒绝
 *    - 微信退款失败 → 抛错，订单保持 PAID
 *    - 积分扣回失败 → 订单保持 PAID + PARTIAL 审计日志
 *    - 套餐不存在时扣回 0 积分
 */
import { ConfigService } from '@nestjs/config'
import axios, { type AxiosInstance } from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { AuditLogService } from '@reelclone/platform-data'
import {
  Order,
  OrderStatus,
  Package,
  PackageStatus,
  PackageType,
  PaymentMethod,
} from '@reelclone/database'
import { ObjectLiteral, Repository } from 'typeorm'
import { BillingClient } from '../billing.client'
import { AdminOrderService } from './admin-order.service'
import { ListOrdersDto } from './dto/list-orders.dto'
import { RefundOrderDto } from './dto/refund-order.dto'

// -------------------- Mock axios --------------------
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
  },
}))

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

/** 构造 Mock AuditLogService */
function mockAuditLogService(): jest.Mocked<AuditLogService> {
  return {
    record: jest.fn().mockResolvedValue(undefined),
    list: jest.fn(),
  } as unknown as jest.Mocked<AuditLogService>
}

/** 构造 Mock 成功响应（InternalHttpClient 自动解包 ApiResponse） */
function mockSuccessResponse<T>(data: T) {
  return { data: { code: ErrorCode.SUCCESS, message: 'ok', data } }
}

/** 构造 Mock 业务错误响应（HTTP 200 但 code 非 SUCCESS） */
function mockBusinessErrorResponse(code: number, message: string) {
  return { data: { code, message, data: null } }
}

describe('AdminOrderService', () => {
  let service: AdminOrderService
  let orderRepo: jest.Mocked<Repository<Order>>
  let packageRepo: jest.Mocked<Repository<Package>>
  let auditLog: jest.Mocked<AuditLogService>
  let billingClient: jest.Mocked<BillingClient>
  let orderClientPost: jest.Mock

  beforeEach(() => {
    orderRepo = mockRepo<Order>()
    packageRepo = mockRepo<Package>()
    auditLog = mockAuditLogService()

    billingClient = {
      grant: jest.fn(),
      deduct: jest.fn(),
      reconcile: jest.fn(),
    } as unknown as jest.Mocked<BillingClient>

    // mock axios.create 返回带 post/get 的 mock 实例（供 InternalHttpClient 使用）
    orderClientPost = jest.fn()
    ;(axios.create as jest.Mock).mockReturnValue({
      post: orderClientPost,
      get: jest.fn(),
    } as unknown as AxiosInstance)

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ORDER_SERVICE_URL') return 'http://order-service:3005'
        if (key === 'INTERNAL_API_KEY') return 'test-internal-key'
        throw new Error(`config key ${key} not found`)
      }),
    } as unknown as jest.Mocked<ConfigService>

    service = new AdminOrderService(orderRepo, packageRepo, auditLog, billingClient, configService)
  })

  afterEach(() => {
    jest.clearAllMocks()
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

  // -------------------- refund（修复版：先下游后状态） --------------------

  describe('refund', () => {
    const dto = new RefundOrderDto()
    dto.reason = '用户投诉，要求退款'

    it('成功退款：先微信退款 → 再扣积分 → 最后标记 REFUNDED', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({ id: 'pkg-001', points: 100, bonusPoints: 20 })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      // 微信退款成功（order-service）
      orderClientPost.mockResolvedValueOnce(mockSuccessResponse(null))
      // 扣积分成功（billing-service，通过 BillingClient mock）
      billingClient.deduct.mockResolvedValueOnce(undefined)

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      expect(result.pointsDeducted).toBe(true)
      expect(result.wechatRefundInitiated).toBe(true)
      expect(orderRepo.save).toHaveBeenCalled()

      // order-service 微信退款调用
      expect(orderClientPost).toHaveBeenCalledWith(
        '/api/v1/orders/o1/refund',
        { reason: '用户投诉，要求退款' },
        expect.any(Object), // axiosConfig with x-request-id header
      )

      // billing 扣积分（amount = 100 + 20 = 120）
      expect(billingClient.deduct).toHaveBeenCalledWith({
        userId: 'user-001',
        amount: 120,
        idempotencyKey: 'order:o1:refund',
        orderId: 'o1',
        description: '订单 o1 退款扣回积分: 用户投诉，要求退款',
      })

      // 审计日志记录 SUCCESS
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_REFUND',
          result: 'SUCCESS',
          targetId: 'o1',
        }),
      )
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

    it('微信退款失败时抛错，订单保持 PAID（可重试）', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({ points: 100, bonusPoints: 20 })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      // 微信退款失败（HTTP 200 但业务码非 SUCCESS，不触发重试）
      orderClientPost.mockResolvedValueOnce(
        mockBusinessErrorResponse(ErrorCode.INTERNAL_ERROR, 'order-service down'),
      )

      await expect(service.refund('o1', dto, 'admin-001')).rejects.toThrow(BusinessException)

      // 订单未被标记为 REFUNDED
      expect(orderRepo.save).not.toHaveBeenCalled()
      // 只调用了 1 次 orderClientPost（微信退款），未调用扣积分
      expect(orderClientPost).toHaveBeenCalledTimes(1)
      expect(billingClient.deduct).not.toHaveBeenCalled()
      // 审计日志记录 FAILURE
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_REFUND',
          result: 'FAILURE',
        }),
      )
    })

    it('积分扣回失败时订单保持 PAID + PARTIAL 审计日志', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      const pkg = createMockPackage({ points: 100, bonusPoints: 20 })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(pkg)
      // 微信退款成功
      orderClientPost.mockResolvedValueOnce(mockSuccessResponse(null))
      // 扣积分失败
      billingClient.deduct.mockRejectedValueOnce(
        new BusinessException(ErrorCode.INTERNAL_ERROR, 'billing down'),
      )

      const result = await service.refund('o1', dto, 'admin-001')

      // 订单保持 PAID（未被 save 为 REFUNDED）
      expect(orderRepo.save).not.toHaveBeenCalled()
      expect(result.order.status).toBe(OrderStatus.PAID)
      expect(result.pointsDeducted).toBe(false)
      expect(result.wechatRefundInitiated).toBe(true)
      // 审计日志记录 PARTIAL
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORDER_REFUND',
          result: 'PARTIAL',
        }),
      )
    })

    it('套餐不存在时扣回积分数为 0 但不阻塞退款', async () => {
      const order = createMockOrder({ id: 'o1', status: OrderStatus.PAID })
      orderRepo.findOne.mockResolvedValueOnce(order)
      packageRepo.findOne.mockResolvedValue(null)
      orderRepo.save.mockResolvedValue(createMockOrder({ id: 'o1', status: OrderStatus.REFUNDED }))
      orderClientPost.mockResolvedValueOnce(mockSuccessResponse(null))
      billingClient.deduct.mockResolvedValueOnce(undefined)

      const result = await service.refund('o1', dto, 'admin-001')

      expect(result.order.status).toBe(OrderStatus.REFUNDED)
      // billing 扣积分 amount = 0
      expect(billingClient.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 0,
        }),
      )
    })
  })
})
