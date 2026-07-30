/**
 * logger.service.ts 单元测试
 *
 * 覆盖 LoggerService 的 info/warn/error/debug 方法、error 时 err 对象提取、
 * getPinoLogger 返回底层实例，以及未注入 context/level 时的默认行为。
 *
 * 策略：不 mock pino（避免破坏 stdTimeFunctions），直接 spy 底层 pino 实例方法。
 * 使用 dev 环境避免 pino-pretty transport 在测试中输出干扰。
 */
import { OBS_LOG_LEVEL, OBS_SERVICE_NAME } from './logger.config'
import { LoggerService } from './logger.service'

describe('LoggerService', () => {
  let service: LoggerService

  beforeEach(() => {
    // 确保非生产环境，避免 transport 初始化
    process.env.NODE_ENV = 'test'
  })

  function createService(context?: string, level?: string): LoggerService {
    // level='silent' 抑制实际输出
    return new LoggerService(context, level ?? 'silent')
  }

  describe('构造与默认值', () => {
    it('未注入 context 和 level 时应正常构造', () => {
      service = createService()
      expect(service).toBeInstanceOf(LoggerService)
    })

    it('注入 context 和 level 时应正常构造', () => {
      service = createService('auth-service', 'silent')
      expect(service).toBeInstanceOf(LoggerService)
    })
  })

  describe('info', () => {
    it('应调用底层 pino.info 并传递消息', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'info')
      service.info('hello')
      expect(spy).toHaveBeenCalledWith({}, 'hello')
    })

    it('应传递 context 对象', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'info')
      service.info('hello', { userId: 'u1' })
      expect(spy).toHaveBeenCalledWith({ userId: 'u1' }, 'hello')
    })

    it('context 为 undefined 时应传递空对象', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'info')
      service.info('hello', undefined)
      expect(spy).toHaveBeenCalledWith({}, 'hello')
    })
  })

  describe('warn', () => {
    it('应调用底层 pino.warn 并传递消息', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'warn')
      service.warn('warning')
      expect(spy).toHaveBeenCalledWith({}, 'warning')
    })

    it('应传递 context 对象', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'warn')
      service.warn('warning', { code: 'W001' })
      expect(spy).toHaveBeenCalledWith({ code: 'W001' }, 'warning')
    })
  })

  describe('error', () => {
    it('应调用底层 pino.error 并传递消息（无 error 对象）', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'error')
      service.error('something wrong')
      expect(spy).toHaveBeenCalledWith({}, 'something wrong')
    })

    it('应提取 error 对象的 message/stack/name', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'error')
      const err = new Error('boom')
      err.stack = 'Error: boom\n  at test'
      service.error('failure', err)
      expect(spy).toHaveBeenCalledWith(
        {
          err: {
            message: 'boom',
            stack: 'Error: boom\n  at test',
            name: 'Error',
          },
        },
        'failure',
      )
    })

    it('应同时合并 error 对象和 context', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'error')
      const err = new Error('boom')
      service.error('failure', err, { userId: 'u1' })
      expect(spy).toHaveBeenCalledWith(
        {
          userId: 'u1',
          err: {
            message: 'boom',
            stack: err.stack,
            name: 'Error',
          },
        },
        'failure',
      )
    })

    it('error 参数为 undefined 时不应添加 err 字段', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'error')
      service.error('failure', undefined, { userId: 'u1' })
      expect(spy).toHaveBeenCalledWith({ userId: 'u1' }, 'failure')
    })

    it('context 为 undefined 时应传递空对象 + err', () => {
      service = createService()
      const spy = jest.spyOn(service.getPinoLogger(), 'error')
      const err = new Error('boom')
      service.error('failure', err, undefined)
      expect(spy).toHaveBeenCalledWith(
        {
          err: {
            message: 'boom',
            stack: err.stack,
            name: 'Error',
          },
        },
        'failure',
      )
    })
  })

  describe('debug', () => {
    it('应调用底层 pino.debug 并传递消息', () => {
      service = createService('s', 'debug') // debug 级别才记录
      const spy = jest.spyOn(service.getPinoLogger(), 'debug')
      service.debug('debugging')
      expect(spy).toHaveBeenCalledWith({}, 'debugging')
    })

    it('应传递 context 对象', () => {
      service = createService('s', 'debug')
      const spy = jest.spyOn(service.getPinoLogger(), 'debug')
      service.debug('debugging', { step: 1 })
      expect(spy).toHaveBeenCalledWith({ step: 1 }, 'debugging')
    })
  })

  describe('getPinoLogger', () => {
    it('应返回底层 pino Logger 实例', () => {
      service = createService()
      const logger = service.getPinoLogger()
      // pino logger 实例应具有 info/warn/error/debug 方法
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.debug).toBe('function')
    })

    it('多次调用应返回同一实例', () => {
      service = createService()
      expect(service.getPinoLogger()).toBe(service.getPinoLogger())
    })
  })

  describe('DI Token 兼容性', () => {
    it('使用 OBS_SERVICE_NAME / OBS_LOG_LEVEL Symbol 作为注入键（确保导出）', () => {
      expect(typeof OBS_SERVICE_NAME).toBe('symbol')
      expect(typeof OBS_LOG_LEVEL).toBe('symbol')
    })
  })
})
