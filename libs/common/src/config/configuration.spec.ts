/**
 * configuration 单元测试
 */
import { configuration } from './configuration'

describe('configuration', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv }
  })

  it('应返回包含所有配置段的对象', () => {
    const config = configuration()
    expect(config).toHaveProperty('env')
    expect(config).toHaveProperty('database')
    expect(config).toHaveProperty('redis')
    expect(config).toHaveProperty('jwt')
    expect(config).toHaveProperty('wechat')
    expect(config).toHaveProperty('wechatPay')
    expect(config).toHaveProperty('seedance')
    expect(config).toHaveProperty('llm')
    expect(config).toHaveProperty('temporal')
    expect(config).toHaveProperty('log')
  })

  describe('env', () => {
    it('默认应为 development 环境', () => {
      delete process.env.NODE_ENV
      const config = configuration()
      expect(config.env.nodeEnv).toBe('development')
      expect(config.env.isDevelopment).toBe(true)
      expect(config.env.isProduction).toBe(false)
    })

    it('设置 NODE_ENV=production 时应识别为生产环境', () => {
      process.env.NODE_ENV = 'production'
      process.env.JWT_SECRET = 'production-secret-at-least-32-chars-long!!'
      const config = configuration()
      expect(config.env.isProduction).toBe(true)
      expect(config.env.isDevelopment).toBe(false)
    })

    it('设置 NODE_ENV=test 时应识别为测试环境', () => {
      process.env.NODE_ENV = 'test'
      const config = configuration()
      expect(config.env.isTest).toBe(true)
    })
  })

  describe('database', () => {
    it('应包含 4 个数据库连接配置', () => {
      const config = configuration()
      expect(config.database).toHaveProperty('main')
      expect(config.database).toHaveProperty('billing')
      expect(config.database).toHaveProperty('template')
      expect(config.database).toHaveProperty('benchmark')
    })

    it('各连接应使用对应的数据库名', () => {
      const config = configuration()
      expect(config.database.main.database).toBe('reelclone_main')
      expect(config.database.billing.database).toBe('reelclone_billing')
      expect(config.database.template.database).toBe('reelclone_template')
      expect(config.database.benchmark.database).toBe('reelclone_benchmark')
    })

    it('应从环境变量读取连接参数', () => {
      process.env.DATABASE_HOST = 'db.example.com'
      process.env.DATABASE_PORT = '6543'
      process.env.DATABASE_USER = 'admin'
      process.env.DATABASE_PASSWORD = 'secret'
      const config = configuration()
      expect(config.database.main.host).toBe('db.example.com')
      expect(config.database.main.port).toBe(6543)
      expect(config.database.main.username).toBe('admin')
      expect(config.database.main.password).toBe('secret')
    })

    it('生产环境应关闭 synchronize 和 logging', () => {
      process.env.NODE_ENV = 'production'
      process.env.JWT_SECRET = 'production-secret-at-least-32-chars-long!!'
      const config = configuration()
      expect(config.database.main.synchronize).toBe(false)
      expect(config.database.main.logging).toBe(false)
    })

    it('开发环境应开启 synchronize 和 logging', () => {
      process.env.NODE_ENV = 'development'
      const config = configuration()
      expect(config.database.main.synchronize).toBe(true)
      expect(config.database.main.logging).toBe(true)
    })
  })

  describe('redis', () => {
    it('应提供默认值', () => {
      delete process.env.REDIS_HOST
      delete process.env.REDIS_PORT
      const config = configuration()
      expect(config.redis.host).toBe('localhost')
      expect(config.redis.port).toBe(6379)
      expect(config.redis.keyPrefix).toBe('reelclone:')
    })

    it('应从环境变量读取', () => {
      process.env.REDIS_HOST = 'redis.example.com'
      process.env.REDIS_PORT = '6380'
      process.env.REDIS_PASSWORD = 'redispass'
      const config = configuration()
      expect(config.redis.host).toBe('redis.example.com')
      expect(config.redis.port).toBe(6380)
      expect(config.redis.password).toBe('redispass')
    })
  })

  describe('jwt', () => {
    it('应从环境变量读取 JWT 配置', () => {
      process.env.JWT_SECRET = 'my-super-secret-key-32chars-long!!!'
      process.env.JWT_EXPIRES_IN = '2h'
      process.env.JWT_REFRESH_EXPIRES_IN = '14d'
      const config = configuration()
      expect(config.jwt.secret).toBe('my-super-secret-key-32chars-long!!!')
      expect(config.jwt.expiresIn).toBe('2h')
      expect(config.jwt.refreshExpiresIn).toBe('14d')
    })
  })

  describe('seedance', () => {
    it('应将逗号分隔的 API Keys 解析为数组', () => {
      process.env.SEEDANCE_API_KEYS = 'key1,key2,key3'
      const config = configuration()
      expect(config.seedance.apiKeys).toEqual(['key1', 'key2', 'key3'])
    })

    it('空字符串应返回空数组', () => {
      process.env.SEEDANCE_API_KEYS = ''
      const config = configuration()
      expect(config.seedance.apiKeys).toEqual([])
    })
  })
})
