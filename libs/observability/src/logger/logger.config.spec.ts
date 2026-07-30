/**
 * logger.config.ts 单元测试
 *
 * 覆盖 createLoggerConfig 在不同环境/参数下的输出。
 */
import pino from 'pino'
import { createLoggerConfig } from './logger.config'

describe('createLoggerConfig', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalServiceName = process.env.SERVICE_NAME

  afterEach(() => {
    // 恢复环境变量，避免测试间相互污染
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    if (originalServiceName === undefined) {
      delete process.env.SERVICE_NAME
    } else {
      process.env.SERVICE_NAME = originalServiceName
    }
  })

  describe('环境判断', () => {
    it('生产环境应返回 JSON 格式（无 transport）', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig()
      expect(config.transport).toBeUndefined()
      expect(config.level).toBe('info')
    })

    it('开发环境应启用 pino-pretty transport', () => {
      process.env.NODE_ENV = 'development'
      const config = createLoggerConfig()
      expect(config.transport).toEqual({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      })
      expect(config.level).toBe('debug')
    })

    it('未设置 NODE_ENV 时按开发环境处理（level=debug）', () => {
      delete process.env.NODE_ENV
      const config = createLoggerConfig()
      expect(config.level).toBe('debug')
      expect(config.transport).toBeDefined()
    })
  })

  describe('serviceName 解析', () => {
    it('options.serviceName 优先级最高', () => {
      process.env.NODE_ENV = 'production'
      process.env.SERVICE_NAME = 'env-service'
      const config = createLoggerConfig({ serviceName: 'options-service' })
      // 通过 formatters.log 注入 service 字段验证
      const logFormatter = (
        config.formatters as { log: (o: Record<string, unknown>) => Record<string, unknown> }
      ).log
      expect(logFormatter({})).toEqual({ service: 'options-service' })
    })

    it('缺少 options.serviceName 时回退到 SERVICE_NAME 环境变量', () => {
      process.env.NODE_ENV = 'production'
      process.env.SERVICE_NAME = 'env-service'
      const config = createLoggerConfig()
      const logFormatter = (
        config.formatters as { log: (o: Record<string, unknown>) => Record<string, unknown> }
      ).log
      expect(logFormatter({})).toEqual({ service: 'env-service' })
    })

    it('既无 options 也无环境变量时 service 为 "unknown"', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.SERVICE_NAME
      const config = createLoggerConfig()
      const logFormatter = (
        config.formatters as { log: (o: Record<string, unknown>) => Record<string, unknown> }
      ).log
      expect(logFormatter({})).toEqual({ service: 'unknown' })
    })

    it('formatters.log 应保留传入字段并前置 service', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig({ serviceName: 'test' })
      const logFormatter = (
        config.formatters as { log: (o: Record<string, unknown>) => Record<string, unknown> }
      ).log
      const result = logFormatter({ userId: 'u1', action: 'login' })
      expect(result).toEqual({
        service: 'test',
        userId: 'u1',
        action: 'login',
      })
    })
  })

  describe('level 解析', () => {
    it('options.level 优先级最高（开发环境）', () => {
      process.env.NODE_ENV = 'development'
      const config = createLoggerConfig({ level: 'warn' })
      expect(config.level).toBe('warn')
    })

    it('options.level 优先级最高（生产环境）', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig({ level: 'error' })
      expect(config.level).toBe('error')
    })

    it('生产环境默认 level=info', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig()
      expect(config.level).toBe('info')
    })
  })

  describe('formatters.level', () => {
    it('应将 level 数字转换为 label 对象', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig()
      const levelFormatter = (
        config.formatters as { level: (l: string) => Record<string, unknown> }
      ).level
      expect(levelFormatter('info')).toEqual({ level: 'info' })
      expect(levelFormatter('error')).toEqual({ level: 'error' })
    })
  })

  describe('timestamp', () => {
    it('应使用 isoTime 时间戳', () => {
      process.env.NODE_ENV = 'production'
      const config = createLoggerConfig()
      expect(config.timestamp).toBe(pino.stdTimeFunctions.isoTime)
    })

    it('开发环境也应使用 isoTime', () => {
      process.env.NODE_ENV = 'development'
      const config = createLoggerConfig()
      expect(config.timestamp).toBe(pino.stdTimeFunctions.isoTime)
    })
  })

  describe('默认参数', () => {
    it('不传 options 时应使用全默认值', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.SERVICE_NAME
      const config = createLoggerConfig()
      expect(config.level).toBe('info')
      const logFormatter = (
        config.formatters as { log: (o: Record<string, unknown>) => Record<string, unknown> }
      ).log
      expect(logFormatter({})).toEqual({ service: 'unknown' })
    })
  })
})
