/**
 * Metrics 模块常量定义
 *
 * 独立文件以避免 metrics.module.ts ↔ http.interceptor.ts 的循环依赖
 * （ESM 模式下 TDZ: Cannot access 'HTTP_REQUESTS_TOTAL' before initialization）
 */

/** HTTP 请求总数 Counter 的注入 Token */
export const HTTP_REQUESTS_TOTAL = 'http_requests_total'

/** HTTP 请求耗时 Histogram 的注入 Token */
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds'
