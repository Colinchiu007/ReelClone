/**
 * AppController 单元测试
 *
 * 测试覆盖：
 *  - GET /admin/health：返回 { status: 'ok', service: 'admin-service' }
 */
import { Test } from '@nestjs/testing'
import { AppController } from './app.controller'

describe('AppController', () => {
  let controller: AppController

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile()

    controller = moduleRef.get(AppController)
  })

  // -------------------- GET /admin/health --------------------

  describe('health', () => {
    it('返回 { status: "ok", service: "admin-service" }', () => {
      const result = controller.health()

      expect(result).toEqual({ status: 'ok', service: 'admin-service' })
      expect(result.status).toBe('ok')
      expect(result.service).toBe('admin-service')
    })
  })
})
