/**
 * AdminContentController 单元测试
 *
 * 测试覆盖：
 *  - GET    /admin/works              → listWorks（查询参数透传）
 *  - DELETE /admin/works/:id          → takedownWork（id + body + userId 透传）
 *  - GET    /admin/templates          → listTemplates
 *  - PUT    /admin/templates/:id/status → updateTemplateStatus（id + body + userId 透传）
 */
import { Test, type TestingModule } from '@nestjs/testing'
import { AdminContentController } from './admin-content.controller'
import { AdminContentService } from './admin-content.service'

describe('AdminContentController', () => {
  let controller: AdminContentController
  let service: jest.Mocked<AdminContentService>

  beforeEach(async () => {
    service = {
      listWorks: jest.fn(),
      takedownWork: jest.fn(),
      listTemplates: jest.fn(),
      updateTemplateStatus: jest.fn(),
    } as unknown as jest.Mocked<AdminContentService>

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminContentController],
      providers: [{ provide: AdminContentService, useValue: service }],
    }).compile()

    controller = module.get(AdminContentController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET /admin/works --------------------

  describe('listWorks', () => {
    it('应将查询参数传递给 service.listWorks', async () => {
      const query = { page: 1, pageSize: 20 }
      const expected = {
        code: 0,
        message: 'success',
        data: { list: [], page: 1, pageSize: 20, total: 0 },
      }
      service.listWorks.mockResolvedValue(expected as never)

      const result = await controller.listWorks(query as never)

      expect(service.listWorks).toHaveBeenCalledWith(query)
      expect(result).toBe(expected)
    })
  })

  // -------------------- DELETE /admin/works/:id --------------------

  describe('takedownWork', () => {
    it('应调用 service.takedownWork 并传入 id, dto, userId', async () => {
      const dto = { reason: '违规内容' }
      const expected = { id: 'w1', status: 'CANCELLED' }
      service.takedownWork.mockResolvedValue(expected as never)

      const result = await controller.takedownWork('w1', dto as never, 'admin1')

      expect(service.takedownWork).toHaveBeenCalledWith('w1', dto, 'admin1')
      expect(result).toEqual(expected)
    })
  })

  // -------------------- GET /admin/templates --------------------

  describe('listTemplates', () => {
    it('应调用 service.listTemplates', async () => {
      const expected = [{ id: 't1' }, { id: 't2' }]
      service.listTemplates.mockResolvedValue(expected as never)

      const result = await controller.listTemplates()

      expect(service.listTemplates).toHaveBeenCalled()
      expect(result).toBe(expected)
    })
  })

  // -------------------- PUT /admin/templates/:id/status --------------------

  describe('updateTemplateStatus', () => {
    it('应调用 service.updateTemplateStatus 并传入 id, dto, userId', async () => {
      const dto = { status: 'ACTIVE' }
      const expected = { id: 't1', status: 'ACTIVE' }
      service.updateTemplateStatus.mockResolvedValue(expected as never)

      const result = await controller.updateTemplateStatus('t1', dto as never, 'admin1')

      expect(service.updateTemplateStatus).toHaveBeenCalledWith('t1', dto, 'admin1')
      expect(result).toEqual(expected)
    })
  })
})
