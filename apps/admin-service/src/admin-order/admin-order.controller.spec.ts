/**
 * AdminOrderController 单元测试
 *
 * 覆盖：
 *  - list：透传 Query DTO 到 service.findAll
 *  - refund：透传 id / body / operatorId 到 service.refund
 */
import { Test } from '@nestjs/testing'
import { AdminOrderController } from './admin-order.controller'
import { AdminOrderService } from './admin-order.service'
import { ListOrdersDto } from './dto/list-orders.dto'
import { RefundOrderDto } from './dto/refund-order.dto'

describe('AdminOrderController', () => {
  let controller: AdminOrderController
  let service: jest.Mocked<AdminOrderService>

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      refund: jest.fn(),
    } as unknown as jest.Mocked<AdminOrderService>

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminOrderController],
      providers: [{ provide: AdminOrderService, useValue: service }],
    }).compile()

    controller = moduleRef.get(AdminOrderController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- list --------------------

  describe('list', () => {
    it('应将 Query DTO 透传给 service.findAll 并返回结果', async () => {
      const dto = new ListOrdersDto()
      dto.page = 2
      dto.pageSize = 10
      const expected = {
        list: [],
        page: 2,
        pageSize: 10,
        total: 0,
      }
      service.findAll.mockResolvedValue(expected)

      const result = await controller.list(dto)

      expect(service.findAll).toHaveBeenCalledWith(dto)
      expect(result).toBe(expected)
    })
  })

  // -------------------- refund --------------------

  describe('refund', () => {
    it('应将 id / dto / operatorId 透传给 service.refund 并返回结果', async () => {
      const dto = new RefundOrderDto()
      dto.reason = '用户投诉，要求退款'
      const expected = {
        order: { id: 'o1' },
        pointsDeducted: true,
        wechatRefundInitiated: true,
      }
      service.refund.mockResolvedValue(expected as never)

      const result = await controller.refund('o1', dto, 'admin-001')

      expect(service.refund).toHaveBeenCalledWith('o1', dto, 'admin-001')
      expect(result).toBe(expected)
    })
  })
})
