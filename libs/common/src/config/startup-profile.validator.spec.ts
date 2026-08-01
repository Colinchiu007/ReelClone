import {
  validateStartupProfile,
  failClosedStartupCheck,
} from './startup-profile.validator'

describe('validateStartupProfile', () => {
  const prodEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(64),
    DATABASE_HOST: 'db.prod.example.com',
  }

  describe('production 环境', () => {
    it('正常配置通过校验', () => {
      const result = validateStartupProfile(prodEnv)
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('TEMPORAL_MOCK_MODE=true 时返回 error', () => {
      const result = validateStartupProfile({ ...prodEnv, TEMPORAL_MOCK_MODE: 'true' })
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('TEMPORAL_MOCK_MODE')
    })

    it('SMS_MOCK_MODE=true 时返回 error', () => {
      const result = validateStartupProfile({ ...prodEnv, SMS_MOCK_MODE: 'true' })
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('SMS_MOCK_MODE')
    })

    it('WECHAT_MOCK_MODE=true 时返回 error', () => {
      const result = validateStartupProfile({ ...prodEnv, WECHAT_MOCK_MODE: 'true' })
      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('WECHAT_MOCK_MODE')
    })

    it('JWT_SECRET 过短时返回 error', () => {
      const result = validateStartupProfile({ ...prodEnv, JWT_SECRET: 'short' })
      expect(result.ok).toBe(false)
      expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true)
    })

    it('DATABASE_HOST=localhost 时返回 warning', () => {
      const result = validateStartupProfile({ ...prodEnv, DATABASE_HOST: 'localhost' })
      expect(result.ok).toBe(true)
      expect(result.warnings.some((w) => w.includes('DATABASE_HOST'))).toBe(true)
    })

    it('多个 mock 标志同时启用时返回多个 error', () => {
      const result = validateStartupProfile({
        ...prodEnv,
        TEMPORAL_MOCK_MODE: 'true',
        SMS_MOCK_MODE: 'true',
        WECHAT_MOCK_MODE: 'true',
        JWT_SECRET: 'short',
      })
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('staging 环境', () => {
    it('TEMPORAL_MOCK_MODE=true 时同样返回 error', () => {
      const result = validateStartupProfile({
        NODE_ENV: 'staging',
        TEMPORAL_MOCK_MODE: 'true',
        JWT_SECRET: 'a'.repeat(64),
      })
      expect(result.ok).toBe(false)
      expect(result.errors[0]).toContain('TEMPORAL_MOCK_MODE')
    })
  })

  describe('development/test 环境', () => {
    it('不检查 mock 标志', () => {
      const result = validateStartupProfile({
        NODE_ENV: 'development',
        TEMPORAL_MOCK_MODE: 'true',
        SMS_MOCK_MODE: 'true',
      })
      expect(result.ok).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('不检查 JWT_SECRET 长度', () => {
      const result = validateStartupProfile({ NODE_ENV: 'test', JWT_SECRET: 'short' })
      expect(result.ok).toBe(true)
    })
  })

  describe('NODE_ENV 未设置', () => {
    it('返回 warning 而非 error', () => {
      const result = validateStartupProfile({})
      expect(result.ok).toBe(true)
      expect(result.warnings.some((w) => w.includes('NODE_ENV'))).toBe(true)
    })
  })
})

describe('failClosedStartupCheck', () => {
  it('校验通过时不抛错', () => {
    expect(() =>
      failClosedStartupCheck({
        NODE_ENV: 'development',
      }),
    ).not.toThrow()
  })

  it('production + mock 标志时抛错', () => {
    expect(() =>
      failClosedStartupCheck({
        NODE_ENV: 'production',
        TEMPORAL_MOCK_MODE: 'true',
        JWT_SECRET: 'a'.repeat(64),
      }),
    ).toThrow('启动校验失败')
  })

  it('抛出的错误包含具体失败原因', () => {
    try {
      failClosedStartupCheck({
        NODE_ENV: 'production',
        TEMPORAL_MOCK_MODE: 'true',
        SMS_MOCK_MODE: 'true',
        JWT_SECRET: 'short',
      })
      fail('应当抛出异常')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toContain('TEMPORAL_MOCK_MODE')
      expect(message).toContain('SMS_MOCK_MODE')
      expect(message).toContain('JWT_SECRET')
    }
  })
})
