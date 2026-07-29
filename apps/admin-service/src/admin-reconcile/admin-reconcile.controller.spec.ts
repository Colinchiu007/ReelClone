/**
 * AdminReconcileController 单元测试
 *
 * 测试覆盖：
 *  - getResults：透传 date 到 service.getResults
 *  - trigger：透传 body + operatorId 到 service.triggerReconcile
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AdminReconcileController } from './admin-reconcile.controller'
import { AdminReconcileService } from './admin-reconcile.service'

describe('AdminReconcileController', () => {
  let controller: AdminReconcileController
  let service: jest.Mocked<AdminReconcileService>

  beforeEach(async () => {
    service = {
      getResults: jest.fn(),
      triggerReconcile: jest.fn(),
    } as unknown as jest.Mocked<AdminReconcileService>

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminReconcileController],
      providers: [{ provide: AdminReconcileService, useValue: service }],
    }).compile()

    controller = module.get<AdminReconcileController>(AdminReconcileController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET /admin/reconcile/results --------------------

  describe('getResults', () => {
    it('传入 date 时应透传给 service.getResults', async () => {
      const mockResult = [
        {
          userId: 'user-1',
          userBalance: 100,
          txBalance: 100,
          frozen: 0,
          expectedBalance: 100,
          difference: 0,
          isConsistent: true,
        },
      ]
      service.getResults.mockResolvedValue(mockResult)

      const result = await controller.getResults('2026-07-29')

      expect(service.getResults).toHaveBeenCalledWith('2026-07-29')
      expect(result).toBe(mockResult)
    })

    it('未传 date 时应透传 undefined（service 内部兜底为今天）', async () => {
      service.getResults.mockResolvedValue([])

      const result = await controller.getResults(undefined)

      expect(service.getResults).toHaveBeenCalledWith(undefined)
      expect(result).toEqual([])
    })
  })

  // -------------------- POST /admin/reconcile --------------------

  describe('trigger', () => {
    it('应将 body 和 operatorId 透传给 service.triggerReconcile', async () => {
      const body = { scope: 'all' }
      const mockSummary = {
        totalUsers: 100,
        inconsistentCount: 2,
        results: [],
        startedAt: '2026-07-29T00:00:00.000Z',
        finishedAt: '2026-07-29T00:00:05.000Z',
      }
      service.triggerReconcile.mockResolvedValue(mockSummary)

      const result = await controller.trigger(body, 'admin-1')

      expect(service.triggerReconcile).toHaveBeenCalledWith(body, 'admin-1')
      expect(result).toBe(mockSummary)
    })

    it('scope 为 userId:xxx 时也应透传', async () => {
      const body = { scope: 'userId:user-123' }
      const mockSummary = {
        totalUsers: 1,
        inconsistentCount: 0,
        results: [],
        startedAt: '2026-07-29T00:00:00.000Z',
        finishedAt: '2026-07-29T00:00:01.000Z',
      }
      service.triggerReconcile.mockResolvedValue(mockSummary)

      const result = await controller.trigger(body, 'admin-2')

      expect(service.triggerReconcile).toHaveBeenCalledWith(body, 'admin-2')
      expect(result.totalUsers).toBe(1)
    })
  })
})
