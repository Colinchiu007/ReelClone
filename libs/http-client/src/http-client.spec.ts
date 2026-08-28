import axios from 'axios'
import { InternalHttpClient, isRetryableError } from './http-client'
import type { AxiosError } from 'axios'
import {
  TRACE_ID_HEADER,
  TRACE_PARENT_HEADER,
  formatTraceParent,
  traceStorage,
  type TraceContext,
} from '@reelclone/common'

describe('isRetryableError', () => {
  it('无 response 的错误（网络错误）可重试', () => {
    const err = { message: 'ECONNREFUSED', response: undefined } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('500 错误可重试', () => {
    const err = { response: { status: 500 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('503 错误可重试', () => {
    const err = { response: { status: 503 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(true)
  })

  it('400 错误不可重试', () => {
    const err = { response: { status: 400 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('404 错误不可重试', () => {
    const err = { response: { status: 404 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('429 错误不可重试', () => {
    const err = { response: { status: 429 } } as unknown as AxiosError
    expect(isRetryableError(err)).toBe(false)
  })

  it('非 Axios 错误可重试（无 response）', () => {
    const err = new Error('random error')
    expect(isRetryableError(err)).toBe(true)
  })
})

describe('InternalHttpClient 出站链路传播', () => {
  const okResponse = { data: { code: 0, message: 'success', data: {} } }
  const mockPost = jest.fn()
  const mockGet = jest.fn()
  let client: InternalHttpClient

  beforeEach(() => {
    mockPost.mockReset().mockResolvedValue(okResponse)
    mockGet.mockReset().mockResolvedValue(okResponse)
    jest.spyOn(axios, 'create').mockReturnValue({ post: mockPost, get: mockGet } as never)
    client = new InternalHttpClient({ baseUrl: 'http://internal-svc', apiKey: 'test-key' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('存在活跃 TraceContext 时 POST 应携带 traceparent 与 x-trace-id', async () => {
    const ctx: TraceContext = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), flags: '01' }

    await traceStorage.run(ctx, () => client.post('/api/v1/foo', {}))

    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/foo',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          [TRACE_PARENT_HEADER]: formatTraceParent(ctx),
          [TRACE_ID_HEADER]: ctx.traceId,
          'x-request-id': expect.any(String),
        }),
      }),
    )
  })

  it('无活跃 TraceContext 时 POST 不携带 traceparent', async () => {
    await client.post('/api/v1/foo', {})

    const [, , config] = mockPost.mock.calls[0]
    expect(config.headers[TRACE_PARENT_HEADER]).toBeUndefined()
    expect(config.headers[TRACE_ID_HEADER]).toBeUndefined()
    expect(config.headers['x-request-id']).toBeDefined()
  })

  it('存在活跃 TraceContext 时 GET 也应传播 traceparent', async () => {
    const ctx: TraceContext = { traceId: 'c'.repeat(32), spanId: 'd'.repeat(16), flags: '01' }

    await traceStorage.run(ctx, () => client.get('/api/v1/foo'))

    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/foo',
      expect.objectContaining({
        headers: expect.objectContaining({
          [TRACE_PARENT_HEADER]: formatTraceParent(ctx),
        }),
      }),
    )
  })

  it('无活跃 TraceContext 时 GET 不携带 trace 头', async () => {
    await client.get('/api/v1/foo')

    const [, config] = mockGet.mock.calls[0]
    expect(config.headers).toBeUndefined()
  })
})
