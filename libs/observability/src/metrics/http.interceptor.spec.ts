/**
 * http.interceptor.ts 单元测试
 *
 * 覆盖 HttpMetricsInterceptor 在以下场景的行为：
 * - 正常响应（tap 分支）：记录 method/route/status
 * - 异常响应（catchError 分支）：记录 error.status 或 500
 * - route 标签解析：优先 route.path，回退 url（去 query）
 * - method/url 缺失时的兜底
 * - 指标 inc/observe 调用验证
 */
import { type ExecutionContext, type CallHandler } from '@nestjs/common'
import { type Counter, type Histogram } from 'prom-client'
import { of, throwError } from 'rxjs'
import { HttpMetricsInterceptor } from './http.interceptor'

describe('HttpMetricsInterceptor', () => {
  let interceptor: HttpMetricsInterceptor
  let mockCounter: { inc: jest.Mock }
  let mockHistogram: { observe: jest.Mock }
  let mockExecutionContext: { switchToHttp: jest.Mock }
  let mockRequest: { method?: string; url?: string; route?: { path?: string } }
  let mockResponse: { statusCode?: number }

  beforeEach(() => {
    mockCounter = { inc: jest.fn() }
    mockHistogram = { observe: jest.fn() }
    mockRequest = { method: 'GET', url: '/api/v1/users', route: { path: '/api/v1/users' } }
    mockResponse = { statusCode: 200 }

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    }

    interceptor = new HttpMetricsInterceptor(
      mockCounter as unknown as Counter<string>,
      mockHistogram as unknown as Histogram<string>,
    )
  })

  function makeCallHandler(emit: 'success' | 'error'): CallHandler {
    if (emit === 'success') {
      return { handle: () => of({ data: 'ok' }) }
    }
    return {
      handle: () => throwError(() => Object.assign(new Error('boom'), { status: 503 })),
    }
  }

  describe('正常响应', () => {
    it('应在 tap 分支记录指标', (done) => {
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          next: () => undefined,
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith({
              method: 'GET',
              route: '/api/v1/users',
              status: '200',
            })
            expect(mockHistogram.observe).toHaveBeenCalledWith(
              { method: 'GET', route: '/api/v1/users', status: '200' },
              expect.any(Number),
            )
            done()
          },
        })
    })

    it('response.statusCode 缺失时应默认 200', (done) => {
      delete mockResponse.statusCode
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(expect.objectContaining({ status: '200' }))
            done()
          },
        })
    })
  })

  describe('异常响应', () => {
    it('应在 catchError 分支记录 error.status', (done) => {
      const callHandler = makeCallHandler('error')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          error: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith({
              method: 'GET',
              route: '/api/v1/users',
              status: '503',
            })
            expect(mockHistogram.observe).toHaveBeenCalled()
            done()
          },
        })
    })

    it('error 无 status 字段时应默认 500', (done) => {
      const callHandler: CallHandler = {
        handle: () => throwError(() => new Error('plain error')),
      }
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          error: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(expect.objectContaining({ status: '500' }))
            done()
          },
        })
    })

    it('异常应被重新抛出（不吞错误）', (done) => {
      const err = Object.assign(new Error('boom'), { status: 503 })
      const callHandler: CallHandler = { handle: () => throwError(() => err) }
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          error: (e) => {
            expect(e).toBe(err)
            done()
          },
        })
    })
  })

  describe('route 标签解析', () => {
    it('应优先使用 request.route.path', (done) => {
      mockRequest.route = { path: '/api/v1/users/:id' }
      mockRequest.url = '/api/v1/users/123'
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(
              expect.objectContaining({ route: '/api/v1/users/:id' }),
            )
            done()
          },
        })
    })

    it('route.path 缺失时应回退到 url（去除 query string）', (done) => {
      delete mockRequest.route
      mockRequest.url = '/api/v1/users/123?foo=bar&baz=1'
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(
              expect.objectContaining({ route: '/api/v1/users/123' }),
            )
            done()
          },
        })
    })

    it('route 和 url 均缺失时应为 "unknown"', (done) => {
      delete mockRequest.route
      delete mockRequest.url
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(
              expect.objectContaining({ route: 'unknown' }),
            )
            done()
          },
        })
    })
  })

  describe('method 缺失', () => {
    it('method 缺失时应为 "UNKNOWN"', (done) => {
      delete mockRequest.method
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            expect(mockCounter.inc).toHaveBeenCalledWith(
              expect.objectContaining({ method: 'UNKNOWN' }),
            )
            done()
          },
        })
    })
  })

  describe('耗时记录', () => {
    it('observe 的 duration 应为非负数（秒）', (done) => {
      const callHandler = makeCallHandler('success')
      interceptor
        .intercept(mockExecutionContext as unknown as ExecutionContext, callHandler)
        .subscribe({
          complete: () => {
            const [labels, duration] = mockHistogram.observe.mock.calls[0]
            expect(labels).toEqual({ method: 'GET', route: '/api/v1/users', status: '200' })
            expect(duration).toBeGreaterThanOrEqual(0)
            // 应小于 1 秒（单元测试很快）
            expect(duration).toBeLessThan(1)
            done()
          },
        })
    })
  })
})
