/**
 * 链路追踪工具：traceId 的生成与传播
 *
 * 通过 HTTP header（x-trace-id）在请求链路中传递 traceId，
 * 若上游未携带则自动生成 uuid v4，保证全链路可关联。
 */
import { v4 as uuidv4 } from 'uuid'

/** traceId 在 HTTP header 中的字段名 */
export const TRACE_ID_HEADER = 'x-trace-id'

/** traceId 在响应 header 中的字段名 */
export const RESPONSE_TRACE_ID_HEADER = 'x-trace-id'

/**
 * 请求 header 的宽松类型定义
 * 兼容 Express / Fastify / 原生 IncomingMessage 等不同框架的 header 类型
 */
type HeaderBag = Record<string, string | string[] | undefined>

/** AsyncLocalStorage 风格的上下文 traceId（单进程内同步传播） */
let currentTraceId: string | undefined

/**
 * 生成新的 traceId（uuid v4，去掉连字符以缩短长度）
 */
export function generateTraceId(): string {
  return uuidv4().replace(/-/g, '')
}

/**
 * 从请求 header 中提取 traceId，若不存在则生成新的
 * @param headers 请求头对象
 * @returns 提取或生成的 traceId
 */
export function extractTraceId(headers: HeaderBag): string {
  const raw = headers[TRACE_ID_HEADER] ?? headers[TRACE_ID_HEADER.toLowerCase()]
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim()
  }
  return generateTraceId()
}

/**
 * 设置当前进程上下文的 traceId（供非 HTTP 场景或异步任务使用）
 */
export function setTraceId(traceId: string): void {
  currentTraceId = traceId
}

/**
 * 获取当前进程上下文的 traceId
 */
export function getTraceId(): string | undefined {
  return currentTraceId
}

/**
 * 清除当前进程上下文的 traceId
 */
export function clearTraceId(): void {
  currentTraceId = undefined
}
