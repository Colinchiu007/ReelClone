/**
 * OrderService 单元测试
 *
 * 覆盖：
 *  - createOrder：成功 / 套餐不存在 / 套餐下架 / Mock 支付参数 / 幂等（重复请求返回首次结果）
 *  - findAll：分页 / 状态筛选
 *  - findOne：找到 / 不存在 / 无所有权
 *  - cancel：成功 / 非 PENDING 状态拒绝
 *  - handleCallback：成功 / 订单不存在 / 幂等（已 PAID）/ 非 SUCCESS 状态 / 签名校验失败 / transaction_id 幂等
 */
// Mock profit-sharing.service to avoid circular dependency via @InjectRepository
jest.mock('../profit-sharing/profit-sharing.service', () => ({
  ProfitSharingService: jest.fn().mockImplementation(() => ({
    initiateProfitSharing: jest.fn().mockResolvedValue(undefined),
  })),
}))

import { BusinessException } from '@reelclone/common'
import {
  Order,
  OrderPaymentEvent,
  OrderStatus,
  Package,
  PackageStatus,
  PackageType,
  PaymentEventStatus,
  PaymentMethod,
  User,
} from '@reelclone/database'
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { OrderService } from './order.service'
import { WechatPayService } from './wechat-pay.service'
import { BillingClient } from './billing.client'
import { CreateOrderDto } from './dto/create-order.dto'
import { ListOrdersDto } from './dto/list-orders.dto'

// -------------------- Mock 工具 --------------------

/** 模拟 Redis 客户端 */
function mockRedis(): Record<string, jest.Mock> {
  const store = new Map<string, string>()
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
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
    save: jest.fn(),
    create: jest.fn((e: unknown) => e),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
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

/** 构造 Mock 订单 */
function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-001',
    userId: 'user-001',
    packageId: 'pkg-001',
    orderNo: 'RC20250101000000123456',
    amount: 9.9,
    status: OrderStatus.PENDING,
    paymentMethod: PaymentMethod.WECHAT,
    paidAt: null,
    cancelledAt: null,
    transactionId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as Order
}

/** 构造 Mock 用户 */
function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    openId: 'oMockOpenid',
    unionId: null,
    mobile: null,
    password: null,
    nickname: 'tester',
    avatarUrl: null,
    email: null,
    currentPoints: 0,
    totalPoints: 0,
    industryPreferences: [],
    status: 'ACTIVE' as never,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User
}

/** 构造 Mock 支付事件（durable inbox） */
function createMockPaymentEvent(overrides: Partial<OrderPaymentEvent> = {}): OrderPaymentEvent {
  return {
    id: 'evt-001',
    orderId: null,
    orderNo: 'RC20250101000000123456',
    transactionId: 'wx_tx_001',
    eventType: 'TRANSACTION.SUCCESS',
    notificationId: 'evt-test-001',
    rawBody: '{}',
    verified: true,
    status: PaymentEventStatus.RECEIVED,
    processedAt: null,
    decryptResult: null,
    errorMessage: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as OrderPaymentEvent
}

describe('OrderService', () => {
  let service: OrderService
  let redis: Record<string, jest.Mock>
  let orderRepo: jest.Mocked<Repository<Order>>
  let packageRepo: jest.Mocked<Repository<Package>>
  let userRepo: jest.Mocked<Repository<User>>
  let paymentEventRepo: jest.Mocked<Repository<OrderPaymentEvent>>
  let mainDataSource: jest.Mocked<DataSource>
  let wechatPay: jest.Mocked<WechatPayService>
  let billingClient: jest.Mocked<BillingClient>

  beforeEach(() => {
    redis = mockRedis()
    orderRepo = mockRepo<Order>()
    packageRepo = mockRepo<Package>()
    userRepo = mockRepo<User>()
    paymentEventRepo = mockRepo<OrderPaymentEvent>()

    mainDataSource = {
      getRepository: jest.fn(),
      transaction: jest.fn(async (cb: (manager: unknown) => Promise<unknown>) =>
        cb({
          findOne: jest.fn(),
          save: jest.fn(),
          create: jest.fn((_: unknown, entity: unknown) => entity),
          update: jest.fn(),
        }),
      ),
    } as unknown as jest.Mocked<DataSource>

    wechatPay = {
      isMockMode: jest.fn().mockReturnValue(true),
      createPaymentParams: jest.fn(),
      verifyAndDecryptCallback: jest.fn(),
    } as unknown as jest.Mocked<WechatPayService>

    billingClient = {
      grant: jest.fn(),
    } as unknown as jest.Mocked<BillingClient>

    service = new OrderService(
      orderRepo,
      packageRepo,
      userRepo,
      paymentEventRepo,
      mainDataSource,
      redis as never,
      wechatPay,
      billingClient,
      { initiateProfitSharing: jest.fn().mockResolvedValue(undefined) } as never,
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- createOrder --------------------

  describe('createOrder', () => {
    it('成功创建订单并返回 Mock 支付参数', async () => {
      const pkg = createMockPackage()
      const user = createMockUser()
      packageRepo.findOne.mockResolvedValue(pkg)
      userRepo.findOne.mockResolvedValue(user)
      orderRepo.create.mockReturnValue(
        createMockOrder({ userId: 'user-001', packageId: 'pkg-001', amount: 9.9 }),
      )
      orderRepo.save.mockResolvedValue(createMockOrder())
      wechatPay.createPaymentParams.mockResolvedValue({
        timeStamp: '1735689600',
        nonceStr: 'mock_nonce',
        package: 'prepay_id=mock_prepay_RC20250101000000123456',
        signType: 'RSA',
        paySign: 'mock_sign',
      })

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'

      const result = await service.createOrder('user-001', dto)

      expect(result).toHaveProperty('orderId')
      expect(result).toHaveProperty('orderNo')
      expect(result.paymentParams.paySign).toBe('mock_sign')
      expect(orderRepo.save).toHaveBeenCalled()
      expect(wechatPay.createPaymentParams).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9.9,
          description: '9.9 体验套餐',
          openid: 'oMockOpenid',
        }),
      )
    })

    it('套餐不存在时抛 NOT_FOUND', async () => {
      packageRepo.findOne.mockResolvedValue(null)

      const dto = new CreateOrderDto()
      dto.packageId = 'not-exist'

      await expect(service.createOrder('user-001', dto)).rejects.toThrow(BusinessException)
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('套餐已下架（OFFLINE）时抛业务异常', async () => {
      const pkg = createMockPackage({ status: PackageStatus.OFFLINE })
      packageRepo.findOne.mockResolvedValue(pkg)

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'

      await expect(service.createOrder('user-001', dto)).rejects.toThrow(BusinessException)
      try {
        await service.createOrder('user-001', dto)
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException)
        expect((e as BusinessException).message).toContain('已下架')
      }
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('微信支付调起失败时订单标记为 CANCELLED 并抛支付失败异常', async () => {
      const pkg = createMockPackage()
      const user = createMockUser()
      packageRepo.findOne.mockResolvedValue(pkg)
      userRepo.findOne.mockResolvedValue(user)
      orderRepo.create.mockReturnValue(createMockOrder())
      orderRepo.save.mockResolvedValue(createMockOrder())
      wechatPay.createPaymentParams.mockRejectedValue(new Error('wechat api error'))

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'

      await expect(service.createOrder('user-001', dto)).rejects.toThrow(BusinessException)
      expect(orderRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: OrderStatus.CANCELLED,
          cancelledAt: expect.any(Date),
        }),
      )
    })

    it('幂等：重复请求返回首次结果，不重复创建订单', async () => {
      const pkg = createMockPackage()
      const user = createMockUser()
      packageRepo.findOne.mockResolvedValue(pkg)
      userRepo.findOne.mockResolvedValue(user)
      orderRepo.create.mockReturnValue(createMockOrder())
      orderRepo.save.mockResolvedValue(createMockOrder())
      wechatPay.createPaymentParams.mockResolvedValue({
        timeStamp: '1735689600',
        nonceStr: 'mock_nonce',
        package: 'prepay_id=mock_prepay_RC20250101000000123456',
        signType: 'RSA',
        paySign: 'mock_sign',
      })

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'
      dto.idempotencyKey = 'idem-key-001'

      const first = await service.createOrder('user-001', dto)
      expect(first.paymentParams.paySign).toBe('mock_sign')

      // 第二次调用：不应再调用 orderRepo.save
      orderRepo.save.mockClear()
      const second = await service.createOrder('user-001', dto)
      expect(second.paymentParams.paySign).toBe('mock_sign')
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('未提供 idempotencyKey 时服务端自动生成', async () => {
      const pkg = createMockPackage()
      const user = createMockUser()
      packageRepo.findOne.mockResolvedValue(pkg)
      userRepo.findOne.mockResolvedValue(user)
      orderRepo.create.mockReturnValue(createMockOrder())
      orderRepo.save.mockResolvedValue(createMockOrder())
      wechatPay.createPaymentParams.mockResolvedValue({
        timeStamp: '1735689600',
        nonceStr: 'mock_nonce',
        package: 'prepay_id=mock_prepay',
        signType: 'RSA',
        paySign: 'mock_sign',
      })

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'
      // 不提供 idempotencyKey

      const result = await service.createOrder('user-001', dto)
      expect(result).toHaveProperty('orderId')
      // 应有缓存写入
      expect(redis.set).toHaveBeenCalled()
    })
  })

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('应分页返回当前用户的订单', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[createMockOrder({ id: 'o1' })], 1]),
      }
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.page = 1
      dto.pageSize = 20

      const result = await service.findAll('user-001', dto)

      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
      expect(qb.where).toHaveBeenCalledWith('o.userId = :userId', {
        userId: 'user-001',
      })
    })

    it('支持 status 筛选', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.status = OrderStatus.PAID

      await service.findAll('user-001', dto)

      expect(qb.andWhere).toHaveBeenCalledWith('o.status = :status', {
        status: OrderStatus.PAID,
      })
    })

    it('分页参数 page=2, pageSize=10', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      orderRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListOrdersDto()
      dto.page = 2
      dto.pageSize = 10

      await service.findAll('user-001', dto)

      // skip = (2-1) * 10 = 10
      expect(qb.skip).toHaveBeenCalledWith(10)
      expect(qb.take).toHaveBeenCalledWith(10)
    })
  })

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('订单存在且属于当前用户时返回详情', async () => {
      const order = createMockOrder({ id: 'o1', userId: 'user-001' })
      orderRepo.findOne.mockResolvedValue(order)

      const result = await service.findOne('user-001', 'o1')
      expect(result).toBe(order)
    })

    it('订单不存在时抛 NOT_FOUND', async () => {
      orderRepo.findOne.mockResolvedValue(null)

      await expect(service.findOne('user-001', 'nope')).rejects.toThrow(BusinessException)
    })

    it('订单存在但不属于当前用户时也抛 NOT_FOUND（不暴露存在性）', async () => {
      const order = createMockOrder({ id: 'o1', userId: 'other-user' })
      orderRepo.findOne.mockResolvedValue(order)

      await expect(service.findOne('user-001', 'o1')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- cancel --------------------

  describe('cancel', () => {
    it('PENDING 状态订单可取消', async () => {
      const order = createMockOrder({
        id: 'o1',
        userId: 'user-001',
        status: OrderStatus.PENDING,
      })
      orderRepo.findOne.mockResolvedValue(order)
      orderRepo.save.mockResolvedValue(
        createMockOrder({
          id: 'o1',
          userId: 'user-001',
          status: OrderStatus.CANCELLED,
        }),
      )

      const result = await service.cancel('user-001', 'o1')

      expect(result.status).toBe(OrderStatus.CANCELLED)
      expect(order.cancelledAt).toBeDefined()
      expect(orderRepo.save).toHaveBeenCalled()
    })

    it('PAID 状态订单不可取消', async () => {
      const order = createMockOrder({
        id: 'o1',
        userId: 'user-001',
        status: OrderStatus.PAID,
      })
      orderRepo.findOne.mockResolvedValue(order)

      await expect(service.cancel('user-001', 'o1')).rejects.toThrow(BusinessException)
      expect(orderRepo.save).not.toHaveBeenCalled()
    })

    it('CANCELLED 状态订单不可重复取消', async () => {
      const order = createMockOrder({
        id: 'o1',
        userId: 'user-001',
        status: OrderStatus.CANCELLED,
      })
      orderRepo.findOne.mockResolvedValue(order)

      await expect(service.cancel('user-001', 'o1')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- handleCallback --------------------

  /** 构造 verifyAndDecryptCallback 成功返回的 Mock 结果 */
  function mockVerifyAndDecryptResult(decrypted: Record<string, unknown> | null) {
    return {
      verified: true,
      notification: {
        verified: true,
        serial: '',
        timestamp: '',
        nonce: '',
        rawBody: '{}',
        body: {
          id: 'evt_001',
          event_type: 'TRANSACTION.SUCCESS',
          resource: { ciphertext: 'x', nonce: 'n' },
        },
      },
      decrypted,
    }
  }

  describe('handleCallback', () => {
    it('成功处理回调：更新订单为 PAID 并调用 billing grant', async () => {
      const order = createMockOrder({
        id: 'o1',
        userId: 'user-001',
        packageId: 'pkg-001',
        status: OrderStatus.PENDING,
        amount: 9.9,
      })
      const pkg = createMockPackage({ id: 'pkg-001', points: 100, bonusPoints: 20, duration: 30 })

      // 模拟事务
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(order).mockResolvedValueOnce(pkg),
        save: jest.fn().mockResolvedValue(createMockOrder()),
        create: jest.fn((_: unknown, entity: unknown) => entity),
        update: jest.fn(),
      }
      ;(mainDataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
      )

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          success_time: '2025-01-01T00:00:00Z',
          amount: { total: 990, currency: 'CNY' },
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(order)
      billingClient.grant.mockResolvedValue({ balance: 120, success: true })

      const result = await service.handleCallback({
        headers: {},
        rawBody: '{}',
      })

      expect(result.processed).toBe(true)
      expect(result.orderNo).toBe('RC20250101000000123456')
      expect(manager.save).toHaveBeenCalled()
      // 应调用 billing grant，amount = 100 + 20 = 120
      expect(billingClient.grant).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-001',
          amount: 120,
          orderId: 'o1',
          packageId: 'pkg-001',
        }),
      )
    })

    it('transaction_id 已存在时幂等返回（durable inbox）', async () => {
      const existingEvent = createMockPaymentEvent({
        id: 'evt-existing',
        orderId: 'o1',
        orderNo: 'RC20250101000000123456',
        transactionId: 'wx_tx_001',
        status: PaymentEventStatus.PROCESSED,
      })

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(existingEvent)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      expect(result.processed).toBe(false)
      expect(result.orderNo).toBe('RC20250101000000123456')
      expect(mainDataSource.transaction).not.toHaveBeenCalled()
      expect(billingClient.grant).not.toHaveBeenCalled()
    })

    it('订单已 PAID 时幂等返回（不重复处理）', async () => {
      const order = createMockOrder({
        id: 'o1',
        status: OrderStatus.PAID,
        transactionId: 'wx_tx_existing',
        amount: 9.9,
      })

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(order)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      expect(result.processed).toBe(false)
      expect(mainDataSource.transaction).not.toHaveBeenCalled()
      expect(billingClient.grant).not.toHaveBeenCalled()
    })

    it('订单不存在时返回 processed=false（避免微信重试）', async () => {
      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC_NOT_EXIST',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(null)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      expect(result.processed).toBe(false)
      expect(mainDataSource.transaction).not.toHaveBeenCalled()
    })

    it('trade_state 非 SUCCESS 时返回 processed=false', async () => {
      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'NOTPAY',
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      expect(result.processed).toBe(false)
      expect(orderRepo.findOne).not.toHaveBeenCalled()
    })

    it('签名校验失败时抛异常', async () => {
      wechatPay.verifyAndDecryptCallback.mockResolvedValue({
        verified: false,
        notification: {
          verified: false,
          serial: '',
          timestamp: '',
          nonce: '',
          rawBody: '{}',
        },
        decrypted: null,
      } as never)

      await expect(service.handleCallback({ headers: {}, rawBody: '{}' })).rejects.toThrow(
        BusinessException,
      )
    })

    it('事务内双重检查：订单已被并发处理为 PAID 时不再处理', async () => {
      const order = createMockOrder({
        id: 'o1',
        status: OrderStatus.PENDING,
        amount: 9.9,
      })
      const paidOrder = createMockOrder({
        id: 'o1',
        status: OrderStatus.PAID,
        transactionId: 'wx_tx_existing',
        amount: 9.9,
      })

      // 事务外查到的是 PENDING，事务内查到的是 PAID（并发场景）
      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(paidOrder),
        save: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      }
      ;(mainDataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
      )

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(order)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      // 事务内发现已 PAID，不会调用 save
      expect(manager.save).not.toHaveBeenCalled()
      expect(billingClient.grant).not.toHaveBeenCalled()
      // 但整体返回 processed=true（因为外层检查时是 PENDING）
      expect(result.processed).toBe(true)
    })

    it('billing grant 失败时订单仍标记为 PAID（容错）', async () => {
      const order = createMockOrder({
        id: 'o1',
        userId: 'user-001',
        packageId: 'pkg-001',
        status: OrderStatus.PENDING,
        amount: 9.9,
      })
      const pkg = createMockPackage({ id: 'pkg-001', points: 100, bonusPoints: 0, duration: 30 })

      const manager = {
        findOne: jest.fn().mockResolvedValueOnce(order).mockResolvedValueOnce(pkg),
        save: jest.fn().mockResolvedValue(createMockOrder()),
        create: jest.fn((_: unknown, entity: unknown) => entity),
        update: jest.fn(),
      }
      ;(mainDataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager),
      )

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(order)
      billingClient.grant.mockRejectedValue(new Error('billing down'))

      // 不应抛错（容错）
      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })
      expect(result.processed).toBe(true)
      expect(manager.save).toHaveBeenCalled()
    })

    it('字段绑定校验失败（金额不匹配）时零状态变更', async () => {
      const order = createMockOrder({
        id: 'o1',
        status: OrderStatus.PENDING,
        amount: 9.9, // 期望 990 分
      })

      wechatPay.verifyAndDecryptCallback.mockResolvedValue(
        mockVerifyAndDecryptResult({
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 100, currency: 'CNY' }, // 100 分 ≠ 990 分
        }) as never,
      )
      paymentEventRepo.findOne.mockResolvedValue(null)
      paymentEventRepo.create.mockReturnValue(createMockPaymentEvent())
      paymentEventRepo.save.mockResolvedValue(createMockPaymentEvent())
      paymentEventRepo.update.mockResolvedValue({ affected: 1 } as never)
      orderRepo.findOne.mockResolvedValue(order)

      const result = await service.handleCallback({ headers: {}, rawBody: '{}' })

      // 零状态变更：订单不更新
      expect(result.processed).toBe(false)
      expect(mainDataSource.transaction).not.toHaveBeenCalled()
      expect(billingClient.grant).not.toHaveBeenCalled()
      // 事件应被标记为 FAILED
      expect(paymentEventRepo.update).toHaveBeenCalledWith(
        'evt-001',
        expect.objectContaining({ errorMessage: expect.stringContaining('amount.total') }),
      )
    })
  })

  // -------------------- 订单号生成 --------------------

  describe('generateOrderNo（通过 createOrder 间接验证）', () => {
    it('订单号格式应为 RC + 14位时间戳 + 6位随机数', async () => {
      const pkg = createMockPackage()
      const user = createMockUser()
      packageRepo.findOne.mockResolvedValue(pkg)
      userRepo.findOne.mockResolvedValue(user)
      orderRepo.create.mockImplementation((entity: unknown) => entity as Order)
      orderRepo.save.mockImplementation(async (entity: unknown) => entity as Order)
      wechatPay.createPaymentParams.mockResolvedValue({
        timeStamp: '1735689600',
        nonceStr: 'mock_nonce',
        package: 'prepay_id=mock_prepay',
        signType: 'RSA',
        paySign: 'mock_sign',
      })

      const dto = new CreateOrderDto()
      dto.packageId = 'pkg-001'

      const result = await service.createOrder('user-001', dto)

      // RC + 14 位数字（yyyyMMddHHmmss）+ 6 位随机数字 = 22 字符
      expect(result.orderNo).toMatch(/^RC\d{14}\d{6}$/)
      expect(result.orderNo.startsWith('RC')).toBe(true)
    })
  })
})
