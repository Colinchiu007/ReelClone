/**
 * metrics.module.ts 单元测试
 *
 * 覆盖 MetricsModule.forRoot 的 DynamicModule 输出，
 * 以及 getOrCreateCounter / getOrCreateHistogram 重复注册保护逻辑。
 *
 * 注意：prom-client 的 register 是全局单例，测试间需清理。
 * collectDefaultMetrics 内部有全局状态，mock 掉避免污染。
 */
import { collectDefaultMetrics, register } from 'prom-client'

// mock collectDefaultMetrics 避免全局状态在测试间污染
jest.mock('prom-client', () => {
  const actual = jest.requireActual('prom-client')
  return {
    ...actual,
    collectDefaultMetrics: jest.fn(),
  }
})

import { HTTP_REQUEST_DURATION_SECONDS, HTTP_REQUESTS_TOTAL, MetricsModule } from './metrics.module'
import { HttpMetricsInterceptor } from './http.interceptor'
import { MetricsController } from './metrics.controller'

describe('MetricsModule', () => {
  beforeEach(() => {
    register.clear()
  })

  afterEach(() => {
    register.clear()
  })

  describe('forRoot', () => {
    it('应返回正确的 DynamicModule 结构', () => {
      const dynamicModule = MetricsModule.forRoot()
      expect(dynamicModule.module).toBe(MetricsModule)
      expect(dynamicModule.controllers).toEqual([MetricsController])
    })

    it('应提供 HTTP_REQUESTS_TOTAL Counter', () => {
      const dynamicModule = MetricsModule.forRoot()
      const provider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUESTS_TOTAL,
      ) as { provide: unknown; useValue: unknown } | undefined

      expect(provider).toBeDefined()
      expect(provider?.useValue).toBeDefined()
      expect((provider?.useValue as { name: string }).name).toBe(HTTP_REQUESTS_TOTAL)
    })

    it('应提供 HTTP_REQUEST_DURATION_SECONDS Histogram', () => {
      const dynamicModule = MetricsModule.forRoot()
      const provider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUEST_DURATION_SECONDS,
      ) as { provide: unknown; useValue: unknown } | undefined

      expect(provider).toBeDefined()
      expect(provider?.useValue).toBeDefined()
      expect((provider?.useValue as { name: string }).name).toBe(HTTP_REQUEST_DURATION_SECONDS)
    })

    it('应提供 HttpMetricsInterceptor', () => {
      const dynamicModule = MetricsModule.forRoot()
      const hasInterceptor = dynamicModule.providers?.some((p) => p === HttpMetricsInterceptor)
      expect(hasInterceptor).toBe(true)
    })

    it('应导出 HttpMetricsInterceptor', () => {
      const dynamicModule = MetricsModule.forRoot()
      expect(dynamicModule.exports).toEqual([HttpMetricsInterceptor])
    })

    it('Counter 应有 method/route/status 标签', () => {
      const dynamicModule = MetricsModule.forRoot()
      const provider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUESTS_TOTAL,
      ) as { useValue: { labelNames: string[] } } | undefined

      expect(provider?.useValue.labelNames).toEqual(['method', 'route', 'status'])
    })

    it('Histogram 应有 method/route/status 标签和 buckets', () => {
      const dynamicModule = MetricsModule.forRoot()
      const provider = dynamicModule.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUEST_DURATION_SECONDS,
      ) as { useValue: { labelNames: string[]; buckets: number[] } } | undefined

      expect(provider?.useValue.labelNames).toEqual(['method', 'route', 'status'])
      expect(provider?.useValue.buckets).toEqual([
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
      ])
    })

    it('应调用 collectDefaultMetrics', () => {
      ;(collectDefaultMetrics as unknown as jest.Mock).mockClear()
      MetricsModule.forRoot()
      expect(collectDefaultMetrics).toHaveBeenCalledTimes(1)
    })
  })

  describe('重复注册保护（HMR 场景）', () => {
    it('多次 forRoot 时 Counter 应复用同一实例', () => {
      const first = MetricsModule.forRoot()
      const second = MetricsModule.forRoot()

      const firstProvider = first.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUESTS_TOTAL,
      ) as { useValue: unknown } | undefined
      const secondProvider = second.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUESTS_TOTAL,
      ) as { useValue: unknown } | undefined

      expect(firstProvider?.useValue).toBe(secondProvider?.useValue)
    })

    it('多次 forRoot 时 Histogram 应复用同一实例', () => {
      const first = MetricsModule.forRoot()
      const second = MetricsModule.forRoot()

      const firstProvider = first.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUEST_DURATION_SECONDS,
      ) as { useValue: unknown } | undefined
      const secondProvider = second.providers?.find(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          'provide' in p &&
          (p as { provide: unknown }).provide === HTTP_REQUEST_DURATION_SECONDS,
      ) as { useValue: unknown } | undefined

      expect(firstProvider?.useValue).toBe(secondProvider?.useValue)
    })

    it('register 应包含已注册的自定义指标', () => {
      MetricsModule.forRoot()
      const metrics = register.getMetricsAsArray()
      const names = metrics.map((m) => m.name)
      expect(names).toContain(HTTP_REQUESTS_TOTAL)
      expect(names).toContain(HTTP_REQUEST_DURATION_SECONDS)
    })
  })

  describe('Token 导出', () => {
    it('HTTP_REQUESTS_TOTAL 应为字符串 token', () => {
      expect(HTTP_REQUESTS_TOTAL).toBe('http_requests_total')
    })

    it('HTTP_REQUEST_DURATION_SECONDS 应为字符串 token', () => {
      expect(HTTP_REQUEST_DURATION_SECONDS).toBe('http_request_duration_seconds')
    })
  })
})
