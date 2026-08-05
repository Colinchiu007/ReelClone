/**
 * @reelclone/http-client — 统一内部 HTTP 客户端
 *
 * 提供：
 *  - InternalHttpClient: 跨服务调用的统一封装（超时、重试、熔断、trace、ApiResponse 解包）
 *  - CircuitBreaker: 轻量熔断器（CLOSED → OPEN → HALF_OPEN 状态机）
 *  - isRetryableError: 判断错误是否可重试（网络错误 + 5xx）
 *  - 类型：HttpClientConfig, RetryConfig, CircuitBreakerConfig, ApiResponse
 */
export { InternalHttpClient } from './http-client'
export { CircuitBreaker } from './circuit-breaker'
export { isRetryableError } from './http-client'
export { createInternalClient } from './http-client'
export type {
  HttpClientConfig,
  RetryConfig,
  ApiResponse,
  CreateInternalClientConfig,
} from './http-client'
export type { CircuitBreakerConfig } from './circuit-breaker'
