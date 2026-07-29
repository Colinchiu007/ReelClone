/**
 * AdminConfigController 单元测试
 *
 * 测试覆盖：
 *  - GET /admin/config/api-keys  listApiKeys：转发到 service.listApiKeys()
 *  - PUT /admin/config/api-keys  updateApiKeys：转发 dto.provider + dto.keys 到 service
 *
 * 安全验证：
 *  - listApiKeys 返回结果不包含明文 Key（仅 keyCount / hasKeys）
 *  - updateApiKeys 返回 success/provider/keyCount（不含明文）
 */
import { Test, TestingModule } from '@nestjs/testing'
import { AdminConfigController } from './admin-config.controller'
import { AdminConfigService } from './admin-config.service'
import { UpdateApiKeysDto } from './dto/update-api-keys.dto'

describe('AdminConfigController', () => {
  let controller: AdminConfigController
  let service: jest.Mocked<AdminConfigService>

  beforeEach(async () => {
    service = {
      listApiKeys: jest.fn(),
      updateApiKeys: jest.fn(),
    } as unknown as jest.Mocked<AdminConfigService>

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminConfigController],
      providers: [{ provide: AdminConfigService, useValue: service }],
    }).compile()

    controller = module.get<AdminConfigController>(AdminConfigController)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET /admin/config/api-keys --------------------

  describe('listApiKeys', () => {
    it('应调用 service.listApiKeys 并返回各 Provider 的 Key 状态', async () => {
      const mockResult = {
        providers: [
          { name: 'seedance' as const, keyCount: 3, hasKeys: true },
          { name: 'llm' as const, keyCount: 1, hasKeys: true },
          { name: 'oss' as const, keyCount: 0, hasKeys: false },
        ],
      }
      service.listApiKeys.mockResolvedValue(mockResult)

      const result = await controller.listApiKeys()

      expect(service.listApiKeys).toHaveBeenCalledTimes(1)
      expect(result).toEqual(mockResult)
    })

    it('返回结果不应包含明文 Key（仅 keyCount 与 hasKeys）', async () => {
      const mockResult = {
        providers: [{ name: 'seedance' as const, keyCount: 2, hasKeys: true }],
      }
      service.listApiKeys.mockResolvedValue(mockResult)

      const result = await controller.listApiKeys()
      const json = JSON.stringify(result)

      // 不应包含常见的 Key 明文标识
      expect(json).not.toContain('sk-')
      expect(json).not.toContain('Bearer ')
      expect(json).not.toContain('secret')
      // 应仅包含 name/keyCount/hasKeys 字段
      expect(result.providers[0]).toEqual({
        name: 'seedance',
        keyCount: 2,
        hasKeys: true,
      })
    })
  })

  // -------------------- PUT /admin/config/api-keys --------------------

  describe('updateApiKeys', () => {
    it('应调用 service.updateApiKeys 并传入 provider 和 keys', async () => {
      const dto: UpdateApiKeysDto = {
        provider: 'seedance',
        keys: ['key-1', 'key-2', 'key-3'],
      }
      const mockResult = {
        success: true as const,
        provider: 'seedance' as const,
        keyCount: 3,
      }
      service.updateApiKeys.mockResolvedValue(mockResult)

      const result = await controller.updateApiKeys(dto)

      expect(service.updateApiKeys).toHaveBeenCalledWith('seedance', ['key-1', 'key-2', 'key-3'])
      expect(result).toEqual(mockResult)
    })

    it('应支持 llm Provider 更新', async () => {
      const dto: UpdateApiKeysDto = {
        provider: 'llm',
        keys: ['llm-key-1'],
      }
      const mockResult = {
        success: true as const,
        provider: 'llm' as const,
        keyCount: 1,
      }
      service.updateApiKeys.mockResolvedValue(mockResult)

      const result = await controller.updateApiKeys(dto)

      expect(service.updateApiKeys).toHaveBeenCalledWith('llm', ['llm-key-1'])
      expect(result.provider).toBe('llm')
      expect(result.keyCount).toBe(1)
    })

    it('应支持 oss Provider 更新', async () => {
      const dto: UpdateApiKeysDto = {
        provider: 'oss',
        keys: ['oss-key-1', 'oss-key-2'],
      }
      const mockResult = {
        success: true as const,
        provider: 'oss' as const,
        keyCount: 2,
      }
      service.updateApiKeys.mockResolvedValue(mockResult)

      const result = await controller.updateApiKeys(dto)

      expect(service.updateApiKeys).toHaveBeenCalledWith('oss', ['oss-key-1', 'oss-key-2'])
      expect(result.success).toBe(true)
    })

    it('返回结果不应包含明文 Key', async () => {
      const dto: UpdateApiKeysDto = {
        provider: 'seedance',
        keys: ['secret-key-xxx'],
      }
      const mockResult = {
        success: true as const,
        provider: 'seedance' as const,
        keyCount: 1,
      }
      service.updateApiKeys.mockResolvedValue(mockResult)

      const result = await controller.updateApiKeys(dto)
      const json = JSON.stringify(result)

      // 不应包含明文 Key
      expect(json).not.toContain('secret-key-xxx')
      expect(result).toEqual({
        success: true,
        provider: 'seedance',
        keyCount: 1,
      })
    })

    it('应支持空 Key 列表（清空场景）', async () => {
      const dto: UpdateApiKeysDto = {
        provider: 'seedance',
        keys: [],
      }
      const mockResult = {
        success: true as const,
        provider: 'seedance' as const,
        keyCount: 0,
      }
      service.updateApiKeys.mockResolvedValue(mockResult)

      const result = await controller.updateApiKeys(dto)

      expect(service.updateApiKeys).toHaveBeenCalledWith('seedance', [])
      expect(result.keyCount).toBe(0)
    })
  })
})
