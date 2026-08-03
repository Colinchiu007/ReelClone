/**
 * 链路追踪工具：traceId 的生成与传播
 *
 * 通过 HTTP header（x-trace-id）在请求链路中传递 traceId，
 * 若上游未携带则自动生成 uuid v4，保证全链路可关联。
 *
 * 基于 Node.js AsyncLocalStorage 实现请求级上下文隔离，
 * 保证并发请求间 traceId 互不干扰。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
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

/**
 * AsyncLocalStorage 实例 — 每个请求拥有独立的 traceId 上下文，
 * 并发请求间互不干扰。
 */
export const traceStorage = new AsyncLocalStorage<string>()

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
 * 设置当前请求上下文的 traceId（供非 HTTP 场景或异步任务使用）
 *
 * 在 AsyncLocalStorage 上下文内运行时，设置当前上下文的 traceId；
 * 若无活跃上下文则静默忽略（避免非请求场景报错）。
 */
export function setTraceId(traceId: string): void {
  const store = traceStorage.getStore()
  if (store !== undefined) {
    traceStorage.enterWith(traceId)
  }
}

/**
 * 获取当前请求上下文的 traceId
 *
 * 从 AsyncLocalStorage 获取当前请求的 traceId；
 * 若不在任何请求上下文中（如启动阶段），返回 undefined。
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()
}

/**
 * 清除当前请求上下文的 traceId
 *
 * 通常不需要手动调用 — 请求结束后 AsyncLocalStorage 上下文自动回收。
 * 仅在需要提前释放引用时使用。
 */
export function clearTraceId(): void {
  const store = traceStorage.getStore()
  if (store !== undefined) {
    traceStorage.enterWith(undefined as unknown as string)
  }
}
