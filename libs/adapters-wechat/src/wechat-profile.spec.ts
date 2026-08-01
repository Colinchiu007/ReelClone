/**
 * resolveWechatProfile 单元测试 — fail closed 行为验证
 */
import { resolveWechatProfile } from './wechat-profile'

describe('resolveWechatProfile', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  /** 重置并设置指定环境变量 */
  function setEnv(overrides: Record<string, string | undefined>): void {
    delete process.env.NODE_ENV
    delete process.env.RUNTIME_PROFILE
    delete process.env.WECHAT_APPID
    delete process.env.WECHAT_SECRET
    delete process.env.WECHAT_MOCK_MODE
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) continue
      process.env[k] = v
    }
  }

  describe('显式测试 profile', () => {
    it('NODE_ENV=test → 允许 Mock，不校验凭证', () => {
      setEnv({ NODE_ENV: 'test' })
      const r = resolveWechatProfile()
      expect(r.profile).toBe('test')
      expect(r.appid).toBe('')
      expect(r.secret).toBe('')
    })

    it('RUNTIME_PROFILE=test → 允许 Mock，即使 NODE_ENV 不是 test', () => {
      setEnv({ NODE_ENV: 'development', RUNTIME_PROFILE: 'test' })
      expect(resolveWechatProfile().profile).toBe('test')
    })

    it('WECHAT_MOCK_MODE=true → 允许 Mock，即使 NODE_ENV 不是 test', () => {
      setEnv({ NODE_ENV: 'development', WECHAT_MOCK_MODE: 'true' })
      expect(resolveWechatProfile().profile).toBe('test')
    })

    it('WECHAT_MOCK_MODE=true → 允许 Mock，即使 production 缺凭证', () => {
      setEnv({ NODE_ENV: 'production', WECHAT_MOCK_MODE: 'true' })
      expect(resolveWechatProfile().profile).toBe('test')
    })

    it('WECHAT_MOCK_MODE 非 "true" → 不视为显式测试 profile', () => {
      setEnv({ NODE_ENV: 'production', WECHAT_MOCK_MODE: 'false' })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('test profile + 有凭证 → 仍为 test（显式测试 profile 优先）', () => {
      setEnv({
        NODE_ENV: 'test',
        WECHAT_APPID: 'wx123',
        WECHAT_SECRET: 'secret',
      })
      expect(resolveWechatProfile().profile).toBe('test')
    })
  })

  describe('real profile', () => {
    it('production + 完整凭证 → real', () => {
      setEnv({
        NODE_ENV: 'production',
        WECHAT_APPID: 'wx123',
        WECHAT_SECRET: 'secret',
      })
      const r = resolveWechatProfile()
      expect(r.profile).toBe('real')
      expect(r.appid).toBe('wx123')
      expect(r.secret).toBe('secret')
    })

    it('development + 有凭证 → real', () => {
      setEnv({
        NODE_ENV: 'development',
        WECHAT_APPID: 'wx',
        WECHAT_SECRET: 's',
      })
      expect(resolveWechatProfile().profile).toBe('real')
    })
  })

  describe('fail closed — production/staging 缺凭证抛错', () => {
    it('production 缺凭证 → 抛错', () => {
      setEnv({ NODE_ENV: 'production' })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('staging 缺凭证 → 抛错', () => {
      setEnv({ NODE_ENV: 'staging' })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('production 仅缺 secret → 抛错', () => {
      setEnv({ NODE_ENV: 'production', WECHAT_APPID: 'wx123' })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('production 仅缺 appid → 抛错', () => {
      setEnv({ NODE_ENV: 'production', WECHAT_SECRET: 'secret' })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('production 凭证为空白字符 → 视为缺凭证抛错', () => {
      setEnv({
        NODE_ENV: 'production',
        WECHAT_APPID: '   ',
        WECHAT_SECRET: '  ',
      })
      expect(() => resolveWechatProfile()).toThrow(/fail closed/)
    })

    it('错误信息应包含缺失的环境变量名', () => {
      setEnv({ NODE_ENV: 'production' })
      expect(() => resolveWechatProfile()).toThrow(/WECHAT_APPID.*WECHAT_SECRET/)
    })
  })

  describe('开发环境回退（与 resolveJwtSecret 开发回退一致）', () => {
    it('development 缺凭证 → 回退 Mock，不抛错', () => {
      setEnv({ NODE_ENV: 'development' })
      expect(resolveWechatProfile().profile).toBe('test')
    })

    it('未设置 NODE_ENV → 视为开发环境回退 Mock', () => {
      setEnv({})
      expect(resolveWechatProfile().profile).toBe('test')
    })
  })

  describe('env 参数注入（不依赖 process.env）', () => {
    it('显式传入 env + 完整凭证 → real', () => {
      const r = resolveWechatProfile({
        NODE_ENV: 'production',
        WECHAT_APPID: 'wx',
        WECHAT_SECRET: 's',
      })
      expect(r.profile).toBe('real')
      expect(r.appid).toBe('wx')
    })

    it('显式传入 env production 缺凭证 → 抛错', () => {
      expect(() => resolveWechatProfile({ NODE_ENV: 'production' })).toThrow(/fail closed/)
    })

    it('显式传入 env test → test', () => {
      expect(resolveWechatProfile({ NODE_ENV: 'test' }).profile).toBe('test')
    })

    it('显式传入 env WECHAT_MOCK_MODE=true → test', () => {
      expect(
        resolveWechatProfile({
          NODE_ENV: 'production',
          WECHAT_MOCK_MODE: 'true',
        }).profile,
      ).toBe('test')
    })
  })
})
