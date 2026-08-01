/**
 * 契约测试 — Task A1: 微信登录 fail closed + Mock adapter 隔离
 *
 * 验证：
 *  1. production/staging profile 缺凭证 → 启动失败（createWechatAdapter 抛错）
 *  2. test profile（NODE_ENV=test / RUNTIME_PROFILE=test / WECHAT_MOCK_MODE=true）→ 允许 Mock adapter
 *  3. WechatService.code2session 仅委托 adapter，业务函数内无 mock/real 分支
 */
import { Test, type TestingModule } from '@nestjs/testing'
import * as fs from 'fs'
import * as path from 'path'
import {
  createWechatAdapter,
  MockWechatAdapter,
  RealWechatAdapter,
  WECHAT_ADAPTER,
  type WechatAdapter,
  type WechatSession,
} from '@reelclone/adapters-wechat'
import { WechatService } from '../wechat.service'

describe('Task A1 契约：微信登录 fail closed + Mock adapter 隔离', () => {
  describe('fail closed — production/staging 缺凭证启动失败', () => {
    it('production 缺凭证 → createWechatAdapter 抛错', () => {
      expect(() => createWechatAdapter({ NODE_ENV: 'production' })).toThrow(/fail closed/)
    })

    it('staging 缺凭证 → createWechatAdapter 抛错', () => {
      expect(() => createWechatAdapter({ NODE_ENV: 'staging' })).toThrow(/fail closed/)
    })

    it('production 仅缺 secret → 抛错', () => {
      expect(() =>
        createWechatAdapter({
          NODE_ENV: 'production',
          WECHAT_APPID: 'wx',
        }),
      ).toThrow(/fail closed/)
    })

    it('production 凭证为空白 → 抛错', () => {
      expect(() =>
        createWechatAdapter({
          NODE_ENV: 'production',
          WECHAT_APPID: '   ',
          WECHAT_SECRET: '  ',
        }),
      ).toThrow(/fail closed/)
    })

    it('production 有完整凭证 → 不抛错，返回 RealWechatAdapter', () => {
      const adapter = createWechatAdapter({
        NODE_ENV: 'production',
        WECHAT_APPID: 'wx-prod',
        WECHAT_SECRET: 'secret-prod',
      })
      expect(adapter).toBeInstanceOf(RealWechatAdapter)
      expect(adapter.isMock).toBe(false)
    })
  })

  describe('test profile 允许 Mock', () => {
    it('NODE_ENV=test → MockWechatAdapter', () => {
      const adapter = createWechatAdapter({ NODE_ENV: 'test' })
      expect(adapter).toBeInstanceOf(MockWechatAdapter)
      expect(adapter.isMock).toBe(true)
    })

    it('RUNTIME_PROFILE=test → MockWechatAdapter（即使 NODE_ENV=production）', () => {
      const adapter = createWechatAdapter({
        NODE_ENV: 'production',
        RUNTIME_PROFILE: 'test',
      })
      expect(adapter).toBeInstanceOf(MockWechatAdapter)
    })

    it('WECHAT_MOCK_MODE=true → MockWechatAdapter（即使 production 缺凭证）', () => {
      const adapter = createWechatAdapter({
        NODE_ENV: 'production',
        WECHAT_MOCK_MODE: 'true',
      })
      expect(adapter).toBeInstanceOf(MockWechatAdapter)
      expect(adapter.isMock).toBe(true)
    })

    it('WECHAT_MOCK_MODE 非 "true" → 不视为显式测试 profile，production 缺凭证抛错', () => {
      expect(() =>
        createWechatAdapter({
          NODE_ENV: 'production',
          WECHAT_MOCK_MODE: 'false',
        }),
      ).toThrow(/fail closed/)
    })

    it('test profile 无凭证 → 不抛错', () => {
      expect(() => createWechatAdapter({ NODE_ENV: 'test' })).not.toThrow()
    })
  })

  describe('业务代码无 mock/real 分支', () => {
    let service: WechatService
    let adapter: jest.Mocked<WechatAdapter>

    beforeEach(async () => {
      adapter = {
        isMock: false,
        code2session: jest.fn(),
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [WechatService, { provide: WECHAT_ADAPTER, useValue: adapter }],
      }).compile()
      service = module.get(WechatService)
    })

    afterEach(() => {
      jest.clearAllMocks()
    })

    it('code2session 仅委托 adapter，不内部分支', async () => {
      const session: WechatSession = {
        openid: 'openid_x',
        sessionKey: 'sk',
        unionid: null,
      }
      adapter.code2session.mockResolvedValueOnce(session)

      const result = await service.code2session('wx-code')

      expect(adapter.code2session).toHaveBeenCalledTimes(1)
      expect(adapter.code2session).toHaveBeenCalledWith('wx-code')
      expect(result).toEqual(session)
    })

    it('空 code → 抛 VALIDATION_ERROR，不调用 adapter', async () => {
      await expect(service.code2session('')).rejects.toThrow(/wechat code/)
      expect(adapter.code2session).not.toHaveBeenCalled()
    })

    it('isMockMode 反映 adapter.isMock（mock 与 real 两种）', () => {
      const mockAdapter: WechatAdapter = {
        isMock: true,
        code2session: jest.fn(),
      }
      const realAdapter: WechatAdapter = {
        isMock: false,
        code2session: jest.fn(),
      }
      expect(new WechatService(mockAdapter).isMockMode()).toBe(true)
      expect(new WechatService(realAdapter).isMockMode()).toBe(false)
    })

    it('wechat.service.ts 源码不含 mock/real 分支方法与字段', () => {
      const source = fs.readFileSync(path.resolve(__dirname, '..', 'wechat.service.ts'), 'utf-8')
      // 业务函数内不应存在 mock/real 分支
      expect(source).not.toMatch(/mockCode2session/)
      expect(source).not.toMatch(/realCode2session/)
      expect(source).not.toMatch(/if\s*\(\s*this\.mockMode\b/)
      expect(source).not.toMatch(/this\.mockMode\s*=/)
    })
  })
})
