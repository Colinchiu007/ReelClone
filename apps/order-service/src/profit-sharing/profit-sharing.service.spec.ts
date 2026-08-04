/**
 * ProfitSharingService 单元测试
 *
 * 覆盖：
 *  - initiateProfitSharing：成功 / 无接收方跳过 / adapter 失败标记 FAILED / 幂等（重复 orderId）
 *  - handleCallback：成功状态 / 幂等（已终态） / 记录不存在
 *  - retryProfitSharing：成功重试 / 非 FAILED 状态拒绝 / 超限标记 EXHAUSTED / 无失败明细标记成功
 */

// Mock @nestjs/typeorm 防止装饰器触发的循环依赖
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => ({}),
  TypeOrmModule: { forFeature: jest.fn() },
  getRepositoryToken: jest.fn(),
}))

// Mock @reelclone/database barrel 提供枚举值（避免 barrel 文件循环依赖）
jest.mock('@reelclone/database', () => ({
  ReceiverStatus: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' },
  ProfitSharingStatus: { PENDING: 'PENDING', PROCESSING: 'PROCESSING', SUCCESS: 'SUCCESS', FAILED: 'FAILED', EXHAUSTED: 'EXHAUSTED' },
  DATABASE_CONNECTIONS: { MAIN: 'main' },
}))

import { ReceiverStatus, ProfitSharingStatus } from '@reelclone/database'
import { ProfitSharingService } from './profit-sharing.service'

// -------------------- Mock 工具 --------------------

function mockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((e: unknown) => e),
    update: jest.fn(),
  }
}

function createMockReceiver() {
  return {
    id: 'recv-001',
    name: '创作者A',
    type: 'USER',
    ratio: 3000,
    receiverType: 'OPENID',
    receiverAccountId: 'oMockOpenId123',
    status: ReceiverStatus.ACTIVE,
    remark: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  }
}

function createMockAdapter() {
  return {
    initiateProfitSharing: jest.fn().mockResolvedValue(undefined),
    queryProfitSharing: jest.fn(),
    createPaymentParams: jest.fn(),
    verifyAndDecryptCallback: jest.fn(),
    verifyNotification: jest.fn(),
    decryptResource: jest.fn(),
  }
}

// -------------------- 测试 --------------------

describe('ProfitSharingService', () => {
  let service: ProfitSharingService
  let receiverRepo: ReturnType<typeof mockRepo>
  let recordRepo: ReturnType<typeof mockRepo>
  let itemRepo: ReturnType<typeof mockRepo>
  let adapter: ReturnType<typeof createMockAdapter>

  beforeEach(() => {
    receiverRepo = mockRepo()
    recordRepo = mockRepo()
    itemRepo = mockRepo()
    adapter = createMockAdapter()

    service = new ProfitSharingService(
      receiverRepo as never,
      recordRepo as never,
      itemRepo as never,
      adapter as never,
    )
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- initiateProfitSharing --------------------

  describe('initiateProfitSharing', () => {
    it('成功发起分账', async () => {
      receiverRepo.find.mockResolvedValue([createMockReceiver()])
      recordRepo.save.mockResolvedValue({})
      itemRepo.save.mockResolvedValue([])
      recordRepo.update.mockResolvedValue({})
      itemRepo.update.mockResolvedValue({})

      await service.initiateProfitSharing({
        orderId: 'order-001',
        orderNo: 'RC20260801120000ABCDEF',
        transactionId: 'tx-001',
        totalAmountYuan: 9.9,
      })

      // 验证创建了 record（总金额 990 分，30% → 297 分）
      expect(recordRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-001',
          orderNo: 'RC20260801120000ABCDEF',
          totalAmount: 990,
          sharedAmount: 297,
        }),
      )
      expect(recordRepo.save).toHaveBeenCalled()
      expect(itemRepo.save).toHaveBeenCalled()
      expect(adapter.initiateProfitSharing).toHaveBeenCalledWith(
        expect.objectContaining({
          orderNo: 'ps_RC20260801120000ABCDEF',
          transactionId: 'tx-001',
          receivers: expect.arrayContaining([
            expect.objectContaining({ amount: 297 }),
          ]),
        }),
      )
      expect(recordRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: ProfitSharingStatus.PROCESSING }),
      )
    })

    it('无活跃接收方时跳过分账', async () => {
      receiverRepo.find.mockResolvedValue([])

      await service.initiateProfitSharing({
        orderId: 'order-002',
        orderNo: 'RC20260801120000XYZ',
        transactionId: 'tx-002',
        totalAmountYuan: 9.9,
      })

      expect(recordRepo.create).not.toHaveBeenCalled()
      expect(adapter.initiateProfitSharing).not.toHaveBeenCalled()
    })

    it('adapter 失败时标记 FAILED', async () => {
      receiverRepo.find.mockResolvedValue([createMockReceiver()])
      recordRepo.save.mockResolvedValue({})
      itemRepo.save.mockResolvedValue([])
      adapter.initiateProfitSharing.mockRejectedValue(new Error('adapter error'))

      await service.initiateProfitSharing({
        orderId: 'order-003',
        orderNo: 'RC20260801120000FAIL',
        transactionId: 'tx-003',
        totalAmountYuan: 9.9,
      })

      expect(recordRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: ProfitSharingStatus.FAILED,
          failureReason: expect.stringContaining('adapter error'),
        }),
      )
    })

    it('orderId 重复时幂等返回', async () => {
      receiverRepo.find.mockResolvedValue([createMockReceiver()])
      recordRepo.save.mockRejectedValue(new Error('duplicate key'))

      await service.initiateProfitSharing({
        orderId: 'order-004',
        orderNo: 'RC20260801120000DUP',
        transactionId: 'tx-004',
        totalAmountYuan: 9.9,
      })

      expect(adapter.initiateProfitSharing).not.toHaveBeenCalled()
    })
  })

  // -------------------- handleCallback --------------------

  describe('handleCallback', () => {
    it('成功回调更新状态', async () => {
      recordRepo.findOne.mockResolvedValue({ id: 'rec-001', orderNo: 'RC20260801120000ABCDEF', status: ProfitSharingStatus.PROCESSING })
      recordRepo.update.mockResolvedValue({})
      itemRepo.find.mockResolvedValue([
        { id: 'item-001', receiverType: 'OPENID', receiverAccountId: 'oMockOpenId123', status: ProfitSharingStatus.PROCESSING },
      ])
      itemRepo.update.mockResolvedValue({})

      await service.handleCallback({
        outOrderNo: 'ps_RC20260801120000ABCDEF',
        state: 'SUCCESS',
        receivers: [{ type: 'OPENID', account: 'oMockOpenId123', amount: 297, state: 'SUCCESS' }],
      })

      expect(recordRepo.update).toHaveBeenCalledWith('rec-001', expect.objectContaining({
        status: ProfitSharingStatus.SUCCESS,
      }))
    })

    it('幂等：已终态直接返回', async () => {
      recordRepo.findOne.mockResolvedValue({ id: 'rec-002', orderNo: 'RC20260801120000ABCDEF', status: ProfitSharingStatus.SUCCESS })

      await service.handleCallback({
        outOrderNo: 'ps_RC20260801120000ABCDEF',
        state: 'SUCCESS',
        receivers: [],
      })

      expect(recordRepo.update).not.toHaveBeenCalled()
    })

    it('记录不存在时 warn 返回', async () => {
      recordRepo.findOne.mockResolvedValue(null)

      await service.handleCallback({
        outOrderNo: 'ps_NOTEXIST',
        state: 'SUCCESS',
        receivers: [],
      })

      expect(recordRepo.update).not.toHaveBeenCalled()
    })
  })

  // -------------------- retryProfitSharing --------------------

  describe('retryProfitSharing', () => {
    it('成功重试失败的分账', async () => {
      recordRepo.findOne.mockResolvedValue({
        id: 'rec-003',
        orderNo: 'RC20260801120000RETRY',
        status: ProfitSharingStatus.FAILED,
        retryCount: 0,
        maxRetryCount: 3,
      })
      itemRepo.find.mockResolvedValue([
        { id: 'item-002', receiverType: 'OPENID', receiverAccountId: 'oMockId', amount: 297, receiverName: '创作者A', status: ProfitSharingStatus.FAILED },
      ])
      recordRepo.update.mockResolvedValue({})
      itemRepo.update.mockResolvedValue({})

      const result = await service.retryProfitSharing('rec-003')

      expect(result.success).toBe(true)
      expect(adapter.initiateProfitSharing).toHaveBeenCalled()
      expect(recordRepo.update).toHaveBeenCalledWith('rec-003', expect.objectContaining({
        status: ProfitSharingStatus.PROCESSING,
        retryCount: 1,
      }))
    })

    it('非 FAILED 状态拒绝', async () => {
      recordRepo.findOne.mockResolvedValue({
        id: 'rec-004',
        status: ProfitSharingStatus.SUCCESS,
      })

      const result = await service.retryProfitSharing('rec-004')

      expect(result.success).toBe(false)
      expect(result.message).toContain('仅 FAILED 状态可重试')
    })

    it('超限标记 EXHAUSTED', async () => {
      recordRepo.findOne.mockResolvedValue({
        id: 'rec-005',
        status: ProfitSharingStatus.FAILED,
        retryCount: 3,
        maxRetryCount: 3,
      })
      recordRepo.update.mockResolvedValue({})

      const result = await service.retryProfitSharing('rec-005')

      expect(result.success).toBe(false)
      expect(result.message).toContain('已达最大重试次数')
      expect(recordRepo.update).toHaveBeenCalledWith('rec-005', expect.objectContaining({
        status: ProfitSharingStatus.EXHAUSTED,
      }))
    })

    it('无失败明细时直接标记成功', async () => {
      recordRepo.findOne.mockResolvedValue({
        id: 'rec-006',
        status: ProfitSharingStatus.FAILED,
        retryCount: 1,
        maxRetryCount: 3,
      })
      itemRepo.find.mockResolvedValue([])
      recordRepo.update.mockResolvedValue({})

      const result = await service.retryProfitSharing('rec-006')

      expect(result.success).toBe(true)
      expect(result.message).toContain('无失败明细')
    })
  })
})
