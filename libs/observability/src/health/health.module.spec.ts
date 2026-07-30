/**
 * health.module.ts 单元测试
 *
 * 覆盖 HealthModule.forRoot 在不同 options 组合下的 DynamicModule 输出。
 */
import { OBS_SERVICE_NAME } from '../logger/logger.config'
import { HealthModule } from './health.module'
import { HealthController } from './health.controller'
import { DatabaseHealthIndicator, RedisHealthIndicator } from './health.indicators'

describe('HealthModule', () => {
  describe('forRoot 默认参数', () => {
    it('不传 options 时应使用默认值', () => {
      const dynamicModule = HealthModule.forRoot()
      expect(dynamicModule.module).toBe(HealthModule)
      expect(dynamicModule.controllers).toEqual([HealthController])
    })

    it('应始终注册 DatabaseHealthIndicator 和 RedisHealthIndicator', () => {
      const dynamicModule = HealthModule.forRoot()
      const providers = dynamicModule.providers ?? []
      expect(providers).toContain(DatabaseHealthIndicator)
      expect(providers).toContain(RedisHealthIndicator)
    })

    it('不传 serviceName 时不应提供 OBS_SERVICE_NAME', () => {
      const dynamicModule = HealthModule.forRoot()
      const providers = dynamicModule.providers ?? []
      const hasServiceName = providers.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === OBS_SERVICE_NAME,
      )
      expect(hasServiceName).toBe(false)
    })
  })

  describe('forRoot 带 serviceName', () => {
    it('传入 serviceName 时应提供 OBS_SERVICE_NAME', () => {
      const dynamicModule = HealthModule.forRoot({ serviceName: 'auth-service' })
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

    it('传入 serviceName 时 providers 应有 3 个元素', () => {
      const dynamicModule = HealthModule.forRoot({ serviceName: 's' })
      expect(dynamicModule.providers).toHaveLength(3)
    })

    it('不传 serviceName 时 providers 应有 2 个元素', () => {
      const dynamicModule = HealthModule.forRoot()
      expect(dynamicModule.providers).toHaveLength(2)
    })
  })
})
