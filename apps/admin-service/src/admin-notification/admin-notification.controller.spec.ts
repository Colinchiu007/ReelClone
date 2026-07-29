/**
 * AdminNotificationController 单元测试
 *
 * 测试覆盖：
 *  - broadcast：透传 dto + operatorId 到 service.broadcast
 *  - send：透传 dto + operatorId 到 service.send
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AdminNotificationController } from './admin-notification.controller'
import { AdminNotificationService } from './admin-notification.service'
import { BroadcastDto } from './dto/broadcast.dto'
import { SendNotificationDto } from './dto/send-notification.dto'

describe('AdminNotificationController', () => {
  let controller: AdminNotificationController
  let service: jest.Mocked<AdminNotificationService>

  beforeEach(async () => {
    service = {
      broadcast: jest.fn(),
      send: jest.fn(),
    } as unknown as jest.Mocked<AdminNotificationService>

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationController],
      providers: [{ provide: AdminNotificationService, useValue: service }],
    }).compile()

    controller = module.get<AdminNotificationController>(AdminNotificationController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- POST /admin/notifications/broadcast --------------------

  describe('broadcast', () => {
    it('应将 dto 和 operatorId 透传给 service.broadcast', async () => {
      const dto = new BroadcastDto()
      dto.title = '系统公告'
      dto.content = '今晚 22:00 系统维护'
      dto.range = 'all'
      const mockResult = { total: 100, success: 98, failed: 2 }
      service.broadcast.mockResolvedValue(mockResult)

      const result = await controller.broadcast(dto, 'admin-1')

      expect(service.broadcast).toHaveBeenCalledWith(dto, 'admin-1')
      expect(result).toBe(mockResult)
      expect(result.total).toBe(100)
      expect(result.success).toBe(98)
      expect(result.failed).toBe(2)
    })

    it('range 为 active 时也应透传', async () => {
      const dto = new BroadcastDto()
      dto.title = '活跃用户专享'
      dto.content = '感谢您的使用'
      dto.range = 'active'
      const mockResult = { total: 50, success: 50, failed: 0 }
      service.broadcast.mockResolvedValue(mockResult)

      const result = await controller.broadcast(dto, 'admin-2')

      expect(service.broadcast).toHaveBeenCalledWith(dto, 'admin-2')
      expect(result.total).toBe(50)
    })
  })

  // -------------------- POST /admin/notifications/send --------------------

  describe('send', () => {
    it('应将 dto 和 operatorId 透传给 service.send', async () => {
      const dto = new SendNotificationDto()
      dto.userId = 'user-123'
      dto.title = '客诉回复'
      dto.content = '您反馈的问题已处理'
      const mockResult = { userId: 'user-123', success: true }
      service.send.mockResolvedValue(mockResult)

      const result = await controller.send(dto, 'admin-1')

      expect(service.send).toHaveBeenCalledWith(dto, 'admin-1')
      expect(result).toBe(mockResult)
      expect(result.success).toBe(true)
    })
  })
})
