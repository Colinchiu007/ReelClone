/**
 * 测试客户端封装
 *
 * 基于 axios 封装，提供：
 *  - 自动注入 Bearer Token（登录后）
 *  - 自动注入 x-api-key（内部 API 调用）
 *  - 自动解包 ApiResponse（{ code, message, data } → data）
 *  - 业务异常抛出（code !== 0 时抛出 ApiError，便于断言）
 *
 * 服务端口默认对齐各微服务 main.ts 中的默认端口：
 *   auth=3001 user=3002 asset=3003 benchmark=3004
 *   template=3005 billing=3006 workbench=3007
 *   notification=3008 order=3009
 *
 * 可通过环境变量覆盖（如使用网关时统一指向同一 host）。
 */
import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type Method,
} from 'axios'

/** 各微服务的默认 base URL（可通过环境变量覆盖） */
export const SERVICE_BASE_URL: Record<string, string> = {
  auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
  user: process.env.USER_SERVICE_URL ?? 'http://localhost:3002',
  asset: process.env.ASSET_SERVICE_URL ?? 'http://localhost:3003',
  benchmark: process.env.BENCHMARK_SERVICE_URL ?? 'http://localhost:3004',
  template: process.env.TEMPLATE_SERVICE_URL ?? 'http://localhost:3005',
  billing: process.env.BILLING_SERVICE_URL ?? 'http://localhost:3006',
  workbench: process.env.WORKBENCH_SERVICE_URL ?? 'http://localhost:3007',
  notification: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3008',
  order: process.env.ORDER_SERVICE_URL ?? 'http://localhost:3009',
}

/** 全局 API 前缀 */
const API_PREFIX = '/api/v1'

/** 内部 API Key（用于 billing 内部接口调用，需与服务的 INTERNAL_API_KEY 一致） */
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? 'reelclone_test_internal_key'

/** 统一响应结构（与 ResponseInterceptor 包装一致） */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** 业务异常（HTTP 200 但 code !== 0，或 HTTP 非 2xx） */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown,
    public readonly traceId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 各服务对齐的路径前缀（用于在 ApiClient 内拼接 base） */
export type ServiceName = keyof typeof SERVICE_BASE_URL

/**
 * 测试客户端
 *
 * 一个用户对应一个 ApiClient 实例：登录后自动持有 Token，
 * 后续请求自动注入 Authorization 头。
 */
export class ApiClient {
  private readonly axiosInstance: AxiosInstance
  private accessToken: string | null = null
  /** 当前登录用户 ID（登录后自动填充，便于跨服务复用） */
  userId?: string

  constructor(
    /** 目标服务名（决定 baseURL） */
    service: ServiceName,
    /** 可选：直接复用一个已有 token（跨服务调用） */
    options: { accessToken?: string; refreshToken?: string; userId?: string } = {},
  ) {
    this.axiosInstance = axios.create({
      baseURL: SERVICE_BASE_URL[service] + API_PREFIX,
      timeout: 15000,
      validateStatus: () => true, // 所有状态码都返回，由 request() 统一处理
    })
    this.accessToken = options.accessToken ?? null
    this.userId = options.userId
  }

  /** 设置 Token（登录后调用） */
  setTokens(accessToken: string): void {
    this.accessToken = accessToken
  }

  /** 获取当前 accessToken（供跨服务复用） */
  getAccessToken(): string | null {
    return this.accessToken
  }

  /**
   * 发送请求并自动解包 ApiResponse.data
   *
   * - 自动注入 Authorization: Bearer <token>
   * - internal=true 时注入 x-api-key
   * - HTTP 非 2xx 或业务 code !== 0 抛出 ApiError
   */
  async request<T = unknown>(
    method: Method,
    path: string,
    options: {
      data?: unknown
      params?: Record<string, unknown>
      headers?: Record<string, string>
      internal?: boolean
      /** 跳过自动解包，返回原始响应体（断言错误结构时使用） */
      raw?: boolean
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    }

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`
    }

    if (options.internal) {
      headers['x-api-key'] = INTERNAL_API_KEY
    }

    const config: AxiosRequestConfig = {
      method,
      url: path,
      data: options.data,
      params: options.params,
      headers,
    }

    let response: AxiosResponse
    try {
      response = await this.axiosInstance.request(config)
    } catch (err) {
      // 网络错误（连接拒绝 / 超时）
      throw new ApiError(-1, `网络请求失败: ${(err as Error).message}`, 0)
    }

    // raw 模式：直接返回响应体（用于断言错误结构）
    if (options.raw) {
      return response.data as T
    }

    const body = response.data as ApiResponse<T>

    // 响应体不是标准 ApiResponse 结构（可能是 webhook 的特殊响应）
    if (typeof body !== 'object' || body === null || !('code' in body)) {
      if (response.status >= 200 && response.status < 300) {
        return body as T
      }
      throw new ApiError(
        -1,
        `HTTP ${response.status}: ${JSON.stringify(body)}`,
        response.status,
        body,
      )
    }

    // 业务异常
    if (body.code !== 0) {
      throw new ApiError(body.code, body.message, response.status, body, body.traceId)
    }

    return body.data
  }

  // -------------------- 便捷方法 --------------------

  get<T = unknown>(
    path: string,
    params?: Record<string, unknown>,
    options: { internal?: boolean; raw?: boolean } = {},
  ): Promise<T> {
    return this.request<T>('GET', path, { params, ...options })
  }

  post<T = unknown>(
    path: string,
    data?: unknown,
    options: { internal?: boolean; raw?: boolean; headers?: Record<string, string> } = {},
  ): Promise<T> {
    return this.request<T>('POST', path, { data, ...options })
  }

  put<T = unknown>(
    path: string,
    data?: unknown,
    options: { internal?: boolean; raw?: boolean } = {},
  ): Promise<T> {
    return this.request<T>('PUT', path, { data, ...options })
  }

  delete<T = unknown>(
    path: string,
    options: { internal?: boolean; raw?: boolean } = {},
  ): Promise<T> {
    return this.request<T>('DELETE', path, options)
  }

  // -------------------- 认证相关便捷方法 --------------------

  /**
   * 微信登录（Mock 模式）
   * 登录成功后自动设置 Token
   */
  async wechatLogin(
    code: string,
    nickname?: string,
    avatarUrl?: string,
  ): Promise<{
    accessToken: string
    refreshToken: string
    user: {
      id: string
      openId: string
      nickname: string
      currentPoints: number
      totalPoints: number
      [key: string]: unknown
    }
    isNewUser: boolean
  }> {
    const result = await this.post<{
      accessToken: string
      refreshToken: string
      user: {
        id: string
        openId: string
        nickname: string
        currentPoints: number
        totalPoints: number
        [key: string]: unknown
      }
      isNewUser: boolean
    }>('/auth/wechat-login', { code, nickname, avatarUrl })

    this.setTokens(result.accessToken)
    this.userId = result.user.id
    return result
  }
}

/**
 * 创建一个客户端实例（指定服务）
 *
 * @example
 * const client = createClient('auth');
 * await client.wechatLogin('test_code');
 */
export function createClient(
  service: ServiceName,
  options?: { accessToken?: string; refreshToken?: string; userId?: string },
): ApiClient {
  return new ApiClient(service, options)
}

/**
 * 基于已有 Token 创建跨服务客户端
 *
 * 登录后用同一套 JWT 访问各微服务（JWT 共享 secret）。
 *
 * @example
 * const authClient = createClient('auth');
 * await authClient.wechatLogin('test_code');
 * const workClient = withToken(authClient, 'workbench');
 */
export function withToken(source: ApiClient, service: ServiceName): ApiClient {
  const token = source.getAccessToken()
  if (!token) {
    throw new Error('源客户端未登录，无可用 Token')
  }
  return new ApiClient(service, {
    accessToken: token,
    refreshToken: undefined,
    userId: source.userId,
  })
}
