/**
 * InternalHttpClient — 跨服务调用的统一 HTTP 客户端
 *
 * 功能：
 *  - 超时：可配置 per-request timeout（默认 10s）
 *  - 重试：网络错误 + 5xx 自动重试（指数退避），4xx 不重试
 *  - 熔断：连续失败达到阈值自动打开，冷却后半开试探
 *  - 幂等：自动注入 x-idempotency-key header
 *  - trace：自动注入 x-request-id header
 *  - ApiResponse 解包：自动 { code, message, data } → 直接返回 data
 *  - 异常映射：HTTP 错误 → BusinessException
 *
 * 使用方式：
 *   const client = new InternalHttpClient({ baseUrl, apiKey })
 *   const data = await client.post<DataType>('/api/v1/endpoint', body)
 */
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { CircuitBreaker, type CircuitBreakerConfig } from './circuit-breaker'

/** ApiResponse 通用包裹格式 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** 重试配置 */
export interface RetryConfig {
  /** 最大重试次数（默认 3） */
  maxRetries: number
  /** 基础重试延迟 ms（默认 200） */
  baseDelayMs: number
}

/** HttpClient 配置 */
export interface HttpClientConfig {
  /** 目标服务 base URL */
  baseUrl: string
  /** 内部 API key（写入 x-api-key header） */
  apiKey?: string
  /** 默认超时 ms（默认 10000） */
  timeoutMs?: number
  /** 默认 headers */
  headers?: Record<string, string>
  /** 重试配置（默认 maxRetries=3, baseDelayMs=200） */
  retry?: Partial<RetryConfig>
  /** 熔断器配置（默认 failureThreshold=5, cooldownMs=30000） */
  circuitBreaker?: Partial<CircuitBreakerConfig>
}

/** 判断错误是否可重试（网络错误 + 5xx） */
export function isRetryableError(err: unknown): boolean {
  const axiosErr = err as AxiosError
  if (!axiosErr.response) {
    return true
  }
  const status = axiosErr.response.status
  return status >= 500 && status < 600
}

export class InternalHttpClient {
  private readonly httpClient: AxiosInstance
  private readonly breaker: CircuitBreaker
  private readonly maxRetries: number
  private readonly baseRetryDelayMs: number

  constructor(config: HttpClientConfig) {
    const {
      baseUrl,
      apiKey = '',
      timeoutMs = 10_000,
      headers = {},
      retry = {},
      circuitBreaker = {},
    } = config

    this.maxRetries = retry.maxRetries ?? 3
    this.baseRetryDelayMs = retry.baseDelayMs ?? 200
    this.breaker = new CircuitBreaker(
      circuitBreaker.failureThreshold ?? 5,
      circuitBreaker.cooldownMs ?? 30_000,
    )

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
        ...headers,
      },
    })
  }

  /** 统一 POST 请求（自动重试 + 熔断 + ApiResponse 解包） */
  async post<T>(
    path: string,
    body: Record<string, unknown>,
    options?: { timeoutMs?: number; idempotencyKey?: string },
  ): Promise<T> {
    return this.requestWithRetry<T>(() => this.rawPost<T>(path, body, options))
  }

  /** 统一 GET 请求（自动重试 + 熔断 + ApiResponse 解包） */
  async get<T>(path: string, options?: { timeoutMs?: number }): Promise<T> {
    return this.requestWithRetry<T>(() => this.rawGet<T>(path, options))
  }

  // -------------------- 内部方法 --------------------

  /** 带重试 + 熔断的请求封装 */
  private async requestWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.breaker.allowRequest()) {
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '服务熔断中，请稍后重试', {
        state: 'OPEN',
      })
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation()
        this.breaker.recordSuccess()
        return result
      } catch (err) {
        lastError = err
        if (err instanceof BusinessException) {
          this.breaker.recordFailure()
          throw err
        }
        const retryable = isRetryableError(err)
        this.breaker.recordFailure()
        if (!retryable || attempt === this.maxRetries) {
          throw this.handleAxiosError(err)
        }
        const delayMs = this.baseRetryDelayMs * Math.pow(2, attempt)
        await this.sleep(delayMs)
      }
    }

    throw this.handleAxiosError(lastError)
  }

  /** 原始 POST：发送请求 + 解包 ApiResponse */
  private async rawPost<T>(
    path: string,
    body: Record<string, unknown>,
    options?: { timeoutMs?: number; idempotencyKey?: string },
  ): Promise<T> {
    const axiosConfig: AxiosRequestConfig = {}
    if (options?.timeoutMs) {
      axiosConfig.timeout = options.timeoutMs
    }

    const headers: Record<string, string> = {}
    if (options?.idempotencyKey) {
      headers['x-idempotency-key'] = options.idempotencyKey
    }
    if (!headers['x-request-id']) {
      headers['x-request-id'] = uuidv4()
    }
    if (Object.keys(headers).length > 0) {
      axiosConfig.headers = headers
    }

    const response = await this.httpClient.post<ApiResponse<T>>(path, body, axiosConfig)
    return this.unwrapResponse<T>(response.data)
  }

  /** 原始 GET：发送请求 + 解包 ApiResponse */
  private async rawGet<T>(path: string, options?: { timeoutMs?: number }): Promise<T> {
    const axiosConfig: AxiosRequestConfig = {}
    if (options?.timeoutMs) {
      axiosConfig.timeout = options.timeoutMs
    }

    const response = await this.httpClient.get<ApiResponse<T>>(path, axiosConfig)
    return this.unwrapResponse<T>(response.data)
  }

  /** 解析 ApiResponse，业务错误码抛异常 */
  private unwrapResponse<T>(resp: ApiResponse<T>): T {
    if (resp.code !== ErrorCode.SUCCESS) {
      if (resp.code === ErrorCode.INSUFFICIENT_CREDITS) {
        throw BusinessException.insufficientCredits(resp.message)
      }
      throw new BusinessException(resp.code as ErrorCode, resp.message || '服务调用失败')
    }
    return resp.data
  }

  /** 统一处理 Axios 错误 */
  private handleAxiosError(err: unknown): never {
    if (err instanceof BusinessException) {
      throw err
    }
    const axiosErr = err as AxiosError<ApiResponse<unknown>>
    const respData = axiosErr.response?.data
    if (respData && typeof respData.code === 'number') {
      if (respData.code === ErrorCode.INSUFFICIENT_CREDITS) {
        throw BusinessException.insufficientCredits(respData.message)
      }
      throw new BusinessException(respData.code as ErrorCode, respData.message || '服务调用失败')
    }
    throw new BusinessException(ErrorCode.INTERNAL_ERROR, '服务暂时不可用，请稍后重试', {
      message: (err as Error).message,
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/** createInternalClient 工厂函数的配置类型 */
export interface CreateInternalClientConfig {
  /** 目标服务 base URL（必填） */
  baseUrl: string
  /** 内部 API key，未提供时从 process.env.INTERNAL_API_KEY 读取 */
  apiKey?: string
  /** 默认超时 ms（默认 10000） */
  timeoutMs?: number
  /** 重试配置（默认 maxRetries=3, baseDelayMs=200） */
  retry?: Partial<RetryConfig>
  /** 熔断器配置（默认 failureThreshold=5, cooldownMs=30000） */
  circuitBreaker?: Partial<CircuitBreakerConfig>
}

/**
 * 创建 InternalHttpClient 的推荐工厂方法。
 *
 * 这是跨服务调用时创建 HTTP 客户端的推荐方式。它会自动从环境变量
 * `INTERNAL_API_KEY` 中读取 API Key 作为后备值，确保客户端始终携带
 * 有效的认证信息。
 *
 * @example
 * ```ts
 * const client = createInternalClient({
 *   baseUrl: 'https://api.example.com',
 *   apiKey: 'optional-override',
 * })
 * const data = await client.post<DataType>('/api/v1/endpoint', body)
 * ```
 */
export function createInternalClient(config: CreateInternalClientConfig): InternalHttpClient {
  const apiKey = config.apiKey || process.env.INTERNAL_API_KEY || ''
  if (!config.baseUrl) {
    throw new BusinessException(
      ErrorCode.INTERNAL_ERROR,
      'createInternalClient: baseUrl is required',
    )
  }
  if (!apiKey) {
    throw new BusinessException(
      ErrorCode.INTERNAL_ERROR,
      'createInternalClient: apiKey is required (provide via config or set INTERNAL_API_KEY env)',
    )
  }

  return new InternalHttpClient({
    ...config,
    apiKey,
  })
}
