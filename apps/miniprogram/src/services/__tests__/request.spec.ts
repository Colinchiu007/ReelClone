/**
 * RequestManager 单元测试
 *
 * 覆盖场景：
 *  - 正常路径：GET/POST/PUT/DELETE 成功返回 data
 *  - Token 注入：有 token 时注入 Authorization 头
 *  - Token 缺失：无 token 时不注入 Authorization 头
 *  - 自定义 header：合并用户 header
 *  - 401 自动重试：第一次 401 → 刷新 token → 重试成功
 *  - 401 重试失败：刷新 token 失败 → 跳转登录
 *  - 401 重试只一次：第二次仍 401 不再刷新
 *  - HTTP 非 2xx 错误：抛出 RequestError + toast
 *  - 业务 code !== 0：抛出 RequestError + toast
 *  - 网络错误：抛出 RequestError + toast
 *  - 超时：错误消息包含"超时"
 *  - 响应格式异常：抛出 RequestError
 *
 * 注意：
 *  RequestManager 内部使用 `setTimeout` 触发 `handleAuthFailure` 跳转，
 *  测试需要用 `jest.useFakeTimers()` 控制。
 */
import Taro from '@tarojs/taro'
import { RequestManager, RequestError } from '../request'
import { tokenStore } from '../token'
import { __resetAll } from '../../../__mocks__/taro'

/** 构造一个成功响应（HTTP 200，业务 code=0） */
function successResponse<T>(data: T) {
  return {
    statusCode: 200,
    data: { code: 0, message: 'ok', data },
  }
}

/** 构造一个 401 响应 */
function unauthorizedResponse() {
  return {
    statusCode: 401,
    data: { code: 401, message: 'unauthorized' },
  }
}

/** 构造一个 HTTP 500 响应 */
function serverErrorResponse(message = 'server error') {
  return {
    statusCode: 500,
    data: { code: 500, message },
  }
}

/** 构造一个业务错误响应（HTTP 200 但 code !== 0） */
function businessErrorResponse(code = 1001, message = 'business error') {
  return {
    statusCode: 200,
    data: { code, message, data: null },
  }
}

describe('RequestManager', () => {
  let request: RequestManager

  beforeEach(() => {
    __resetAll()
    request = new RequestManager('http://localhost:3000/api')
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('正常路径', () => {
    it('GET 请求成功应返回 data', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse({ id: 1, name: 'test' }))

      const result = await request.get('/users/me')
      expect(result).toEqual({ id: 1, name: 'test' })
    })

    it('POST 请求成功应返回 data', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse({ created: true }))

      const result = await request.post('/items', { name: 'foo' })
      expect(result).toEqual({ created: true })
    })

    it('PUT 请求成功应返回 data', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse({ updated: true }))

      const result = await request.put('/items/1', { name: 'bar' })
      expect(result).toEqual({ updated: true })
    })

    it('DELETE 请求成功应返回 data', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse({ deleted: true }))

      const result = await request.delete('/items/1')
      expect(result).toEqual({ deleted: true })
    })

    it('应使用默认 GET 方法当 method 未指定', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.request({ url: '/ping' })
      expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET' }))
    })

    it('应拼接 baseUrl + url', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me')
      expect(Taro.request).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://localhost:3000/api/users/me' }),
      )
    })

    it('应传递 data 到 Taro.request', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      const payload = { name: 'foo', age: 18 }
      await request.post('/items', payload)
      expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ data: payload }))
    })

    it('应设置 15s 超时', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me')
      expect(Taro.request).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }))
    })
  })

  describe('Token 注入', () => {
    it('有 token 时应注入 Authorization: Bearer <token>', async () => {
      tokenStore.setTokens('my-access-token', 'my-refresh-token')
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me')
      expect(Taro.request).toHaveBeenCalledWith(
        expect.objectContaining({
          header: expect.objectContaining({
            Authorization: 'Bearer my-access-token',
          }),
        }),
      )
    })

    it('无 token 时不应注入 Authorization', async () => {
      // 清空 token
      tokenStore.clear()
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me')
      const callArgs = (Taro.request as jest.Mock).mock.calls[0][0] as {
        header: Record<string, string>
      }
      expect(callArgs.header.Authorization).toBeUndefined()
    })

    it('应默认设置 content-type: application/json', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me')
      expect(Taro.request).toHaveBeenCalledWith(
        expect.objectContaining({
          header: expect.objectContaining({
            'content-type': 'application/json',
          }),
        }),
      )
    })

    it('应合并自定义 header', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(successResponse(null))

      await request.get('/users/me', undefined, { 'X-Trace-Id': 'abc-123' })
      expect(Taro.request).toHaveBeenCalledWith(
        expect.objectContaining({
          header: expect.objectContaining({
            'X-Trace-Id': 'abc-123',
            'content-type': 'application/json',
          }),
        }),
      )
    })
  })

  describe('401 自动刷新重试', () => {
    it('第一次 401 → 刷新 token → 重试成功', async () => {
      tokenStore.setTokens('old-access', 'old-refresh')

      // 第一次 401，第二次成功
      const newAccess = 'new-access-token'
      ;(Taro.request as jest.Mock)
        .mockResolvedValueOnce(unauthorizedResponse())
        .mockResolvedValueOnce(successResponse({ ok: true }))

      // 刷新 token 接口也走 Taro.request，需要单独 mock
      // 但 refreshAccessToken 使用原生 Taro.request 调用 /auth/refresh-token
      // 这里我们让所有 Taro.request 调用第一次返回 401，第二次返回成功
      // 注意：refreshAccessToken 的请求也会走 Taro.request
      // 重新设计：第一次业务请求 401，第二次是 refresh-token 请求 200，第三次是重试业务请求 200
      ;(Taro.request as jest.Mock).mockReset()
      ;(Taro.request as jest.Mock)
        .mockResolvedValueOnce(unauthorizedResponse()) // 业务请求 1: 401
        .mockResolvedValueOnce({
          // refresh-token 请求: 200
          statusCode: 200,
          data: {
            code: 0,
            data: { accessToken: newAccess, refreshToken: 'new-refresh' },
          },
        })
        .mockResolvedValueOnce(successResponse({ ok: true })) // 业务请求 2: 200

      const result = await request.get('/users/me')
      expect(result).toEqual({ ok: true })
      // token 应已更新
      expect(tokenStore.getAccessToken()).toBe(newAccess)
      // Taro.request 应被调用 3 次（业务1 + refresh + 业务2）
      expect(Taro.request).toHaveBeenCalledTimes(3)
    })

    it('刷新 token 失败应抛错 + 跳转登录', async () => {
      tokenStore.setTokens('old-access', 'old-refresh')

      // 第一次 401，刷新接口也失败
      ;(Taro.request as jest.Mock).mockReset()
      ;(Taro.request as jest.Mock)
        .mockResolvedValueOnce(unauthorizedResponse()) // 业务请求: 401
        .mockResolvedValueOnce({
          // refresh-token 请求: 401（refreshToken 过期）
          statusCode: 401,
          data: { code: 401, message: 'refresh token expired' },
        })

      await expect(request.get('/users/me')).rejects.toThrow('登录已过期')
      // token 应已清空
      expect(tokenStore.getAccessToken()).toBeNull()
      // 应显示 toast
      expect(Taro.showToast).toHaveBeenCalled()
      // 触发 setTimeout 后应跳转
      jest.runAllTimers()
      expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/home/index' })
    })

    it('无 refreshToken 时 401 应直接跳转登录', async () => {
      // 不设置任何 token
      tokenStore.clear()
      ;(Taro.request as jest.Mock).mockResolvedValueOnce(unauthorizedResponse())

      await expect(request.get('/users/me')).rejects.toThrow('登录已过期')
      expect(Taro.showToast).toHaveBeenCalled()
      jest.runAllTimers()
      expect(Taro.reLaunch).toHaveBeenCalledWith({ url: '/pages/home/index' })
    })

    it('401 重试只发生一次（第二次 401 不再刷新，走 HTTP 非 2xx 分支）', async () => {
      tokenStore.setTokens('old-access', 'old-refresh')

      ;(Taro.request as jest.Mock).mockReset()
      ;(Taro.request as jest.Mock)
        .mockResolvedValueOnce(unauthorizedResponse()) // 业务1: 401
        .mockResolvedValueOnce({
          // refresh: 200
          statusCode: 200,
          data: {
            code: 0,
            data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
          },
        })
        .mockResolvedValueOnce(unauthorizedResponse()) // 业务2: 仍 401（不再刷新，走 HTTP 非 2xx 分支）

      // 第二次 401 时 allowRetry=false，会进入 HTTP 非 2xx 分支抛 body.message
      await expect(request.get('/users/me')).rejects.toThrow('unauthorized')
      // Taro.request 应被调用 3 次（业务1 + refresh + 业务2），不再有第 4 次
      expect(Taro.request).toHaveBeenCalledTimes(3)
      // 第二次 401 不应触发 handleAuthFailure（不跳转登录）
      expect(Taro.reLaunch).not.toHaveBeenCalled()
    })
  })

  describe('HTTP 错误处理', () => {
    it('HTTP 500 应抛出 RequestError', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(serverErrorResponse('db down'))

      await expect(request.get('/users/me')).rejects.toThrow('db down')
      // 应显示 toast
      expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'db down' }))
    })

    it('HTTP 错误的 RequestError 应包含 statusCode', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(serverErrorResponse())

      try {
        await request.get('/users/me')
        fail('应抛出 RequestError')
      } catch (err) {
        expect(err).toBeInstanceOf(RequestError)
        expect((err as RequestError).statusCode).toBe(500)
      }
    })

    it('HTTP 错误响应体无 message 时使用默认消息', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue({
        statusCode: 503,
        data: undefined,
      })

      await expect(request.get('/users/me')).rejects.toThrow('请求失败 (503)')
    })
  })

  describe('业务错误处理', () => {
    it('业务 code !== 0 应抛出 RequestError', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue(businessErrorResponse(1001, '参数错误'))

      await expect(request.get('/users/me')).rejects.toThrow('参数错误')
      expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '参数错误' }))
    })

    it('业务错误的 RequestError 应包含 code 和 traceId', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        data: { code: 1001, message: '参数错误', data: null, traceId: 'trace-abc' },
      })

      try {
        await request.get('/users/me')
        fail('应抛出 RequestError')
      } catch (err) {
        expect(err).toBeInstanceOf(RequestError)
        expect((err as RequestError).code).toBe(1001)
        expect((err as RequestError).traceId).toBe('trace-abc')
      }
    })

    it('业务 code=0 但无 data 字段应返回 undefined', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        data: { code: 0, message: 'ok' }, // 无 data
      })

      const result = await request.get('/users/me')
      expect(result).toBeUndefined()
    })
  })

  describe('网络错误处理', () => {
    it('Taro.request 抛错时应抛出 RequestError', async () => {
      ;(Taro.request as jest.Mock).mockRejectedValue(new Error('network down'))

      await expect(request.get('/users/me')).rejects.toThrow('网络异常')
      expect(Taro.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '网络异常，请检查网络连接' }),
      )
    })

    it('超时错误消息应包含"超时"', async () => {
      ;(Taro.request as jest.Mock).mockRejectedValue(new Error('request timeout'))

      await expect(request.get('/users/me')).rejects.toThrow('超时')
      expect(Taro.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '请求超时，请稍后重试' }),
      )
    })

    it('网络错误的 RequestError code 应为 -1', async () => {
      ;(Taro.request as jest.Mock).mockRejectedValue(new Error('network down'))

      try {
        await request.get('/users/me')
        fail('应抛出 RequestError')
      } catch (err) {
        expect(err).toBeInstanceOf(RequestError)
        expect((err as RequestError).code).toBe(-1)
      }
    })
  })

  describe('响应格式异常', () => {
    it('响应体 code 不是数字时应抛出 RequestError', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        data: { message: 'invalid' }, // 无 code 字段
      })

      await expect(request.get('/users/me')).rejects.toThrow('响应格式异常')
    })

    it('响应体为 null 时应抛出 RequestError', async () => {
      ;(Taro.request as jest.Mock).mockResolvedValue({
        statusCode: 200,
        data: null,
      })

      await expect(request.get('/users/me')).rejects.toThrow('响应格式异常')
    })
  })

  describe('并发控制', () => {
    // 此测试不使用 fake timers（需要真实 setTimeout 让 Promise 完成）
    beforeEach(() => {
      jest.useRealTimers()
    })

    it('请求应通过 acquireSlot/releaseSlot 排队', async () => {
      // 简化测试：验证高并发场景下所有请求都能完成
      // RequestManager 默认 concurrencyLimit=8，我们发 10 个请求
      const mockReq = Taro.request as jest.Mock
      mockReq.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(successResponse('ok')), 10)),
      )

      const promises = Array.from({ length: 10 }, (_, i) => request.get(`/items/${i}`))
      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      expect(mockReq).toHaveBeenCalledTimes(10)
    })
  })
})
