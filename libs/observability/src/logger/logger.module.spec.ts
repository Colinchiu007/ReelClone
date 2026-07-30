/**
 * logger.module.ts 单元测试
 *
 * 覆盖 LoggerModule.forRoot 在不同 options 组合下的 DynamicModule 输出。
 */
import { OBS_LOG_LEVEL, OBS_SERVICE_NAME } from './logger.config'
import { LoggerModule, type LoggerModuleOptions } from './logger.module'
import { LoggerService } from './logger.service'

describe('LoggerModule', () => {
  describe('forRoot', () => {
    it('应返回正确的 DynamicModule 结构', () => {
      const options: LoggerModuleOptions = { serviceName: 'auth-service' }
      const dynamicModule = LoggerModule.forRoot(options)

      expect(dynamicModule.module).toBe(LoggerModule)
      expect(dynamicModule.exports).toEqual([LoggerService])
    })

    it('应提供 OBS_SERVICE_NAME 使用 options.serviceName', () => {
      const dynamicModule = LoggerModule.forRoot({ serviceName: 'auth-service' })
      const serviceNameProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === OBS_SERVICE_NAME,
      ) as { provide: unknown; useValue: unknown } | undefined

      expect(serviceNameProvider).toBeDefined()
      expect(serviceNameProvider?.useValue).toBe('auth-service')
    })

    it('应提供 OBS_LOG_LEVEL 使用 options.level', () => {
      const dynamicModule = LoggerModule.forRoot({ serviceName: 's', level: 'warn' })
      const logLevelProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === OBS_LOG_LEVEL,
      ) as { provide: unknown; useValue: unknown } | undefined

      expect(logLevelProvider).toBeDefined()
      expect(logLevelProvider?.useValue).toBe('warn')
    })

    it('options.level 为 undefined 时 OBS_LOG_LEVEL useValue 也为 undefined', () => {
      const dynamicModule = LoggerModule.forRoot({ serviceName: 's' })
      const logLevelProvider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === OBS_LOG_LEVEL,
      ) as { provide: unknown; useValue: unknown } | undefined

      expect(logLevelProvider).toBeDefined()
      expect(logLevelProvider?.useValue).toBeUndefined()
    })

    it('应提供 LoggerService 作为可注入 provider', () => {
      const dynamicModule = LoggerModule.forRoot({ serviceName: 's' })
      const hasLoggerService = dynamicModule.providers?.some((p) => p === LoggerService)
      expect(hasLoggerService).toBe(true)
    })

    it('providers 数组应包含 3 个元素（OBS_SERVICE_NAME + OBS_LOG_LEVEL + LoggerService）', () => {
      const dynamicModule = LoggerModule.forRoot({ serviceName: 's', level: 'info' })
      expect(dynamicModule.providers).toHaveLength(3)
    })
  })
})
