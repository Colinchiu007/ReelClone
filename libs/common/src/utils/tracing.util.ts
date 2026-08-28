/**
 * 链路追踪工具：W3C traceparent 兼容的 TraceContext 生成、解析与传播
 *
 * 统一使用 W3C Trace Context 标准（https://www.w3.org/TR/trace-context/）：
 *  - traceparent header：`00-<32位hex traceId>-<16位hex spanId>-<2位hex flags>`
 *  - 保持对 legacy `x-trace-id` header 的读写兼容（宽松透传）
 *
 * 通过 Node.js AsyncLocalStorage 实现请求级上下文隔离，
 * 保证并发请求间 TraceContext 互不干扰。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'

/** W3C traceparent header 名 */
export const TRACE_PARENT_HEADER = 'traceparent'

/** legacy traceId header 名（x-trace-id，读写兼容保留） */
export const TRACE_ID_HEADER = 'x-trace-id'

/** traceId 在响应 header 中的字段名（兼容保留） */
export const RESPONSE_TRACE_ID_HEADER = 'x-trace-id'

/**
 * TraceContext — 一次请求/链路的追踪上下文
 * traceId 在整个链路中保持不变；spanId 在每次跨服务调用/子任务切换时重新生成。
 */
export interface TraceContext {
  /** 32 位 hex 全局唯一链路 ID */
  traceId: string
  /** 16 位 hex 当前调用段 ID */
  spanId: string
  /** 2 位 hex 采样标志（'01' = sampled） */
  flags: string
}

/**
 * 请求 header 的宽松类型定义
 * 兼容 Express / Fastify / 原生 IncomingMessage 等不同框架的 header 类型
 */
type HeaderBag = Record<string, string | string[] | undefined>

/**
 * AsyncLocalStorage 实例 — 每个请求拥有独立的 TraceContext 上下文，
 * 并发请求间互不干扰。
 */
export const traceStorage = new AsyncLocalStorage<TraceContext>()

/**
 * 生成新的 traceId（32 位 hex）
 */
export function generateTraceId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 生成新的 spanId（16 位 hex）
 */
export function generateSpanId(): string {
  return randomBytes(8).toString('hex')
}

/**
 * 生成全新的 TraceContext（sampled）
 */
export function generateTraceContext(): TraceContext {
  return { traceId: generateTraceId(), spanId: generateSpanId(), flags: '01' }
}

/**
 * 将 TraceContext 序列化为 W3C traceparent 字符串
 * @param ctx TraceContext
 * @returns `00-<traceId>-<spanId>-<flags>`
 */
export function formatTraceParent(ctx: TraceContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.flags}`
}

/**
 * 解析 W3C traceparent 字符串
 * 严格校验 version=00、traceId 32 位 hex（非全零）、spanId 16 位 hex（非全零）、flags 2 位 hex。
 * 非法输入返回 null，由调用方决定回退策略。
 * @param value traceparent header 值
 * @returns 解析成功的 TraceContext，非法返回 null
 */
export function parseTraceParent(value: string): TraceContext | null {
  if (typeof value !== 'string') {
    return null
  }
  const parts = value.trim().split('-')
  if (parts.length !== 4) {
    return null
  }
  const [version, traceId, spanId, flags] = parts
  if (version !== '00') {
    return null
  }
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '0'.repeat(32)) {
    return null
  }
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === '0'.repeat(16)) {
    return null
  }
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null
  }
  return { traceId, spanId, flags }
}

/**
 * 从请求 headers 提取 TraceContext（优先级：traceparent → x-trace-id → 全新生成）
 *
 *  - 有合法 `traceparent`：直接采纳（跨服务传播，保留上层 spanId 作为根 span）
 *  - 无 traceparent 但有 `x-trace-id`：以该 traceId 为链路（spanId 新生成本服务根 span）
 *  - 两者皆无：生成全新 TraceContext
 *
 * @param headers 请求头对象
 */
export function extractTraceContext(headers: HeaderBag): TraceContext {
  const tp = headers[TRACE_PARENT_HEADER] ?? headers[TRACE_PARENT_HEADER.toLowerCase()]
  if (typeof tp === 'string') {
    const parsed = parseTraceParent(tp)
    if (parsed) {
      return parsed
    }
  }

  const raw = headers[TRACE_ID_HEADER] ?? headers[TRACE_ID_HEADER.toLowerCase()]
  if (typeof raw === 'string' && raw.trim().length > 0) {
    // legacy 兼容：x-trace-id 宽松透传（不强校验格式）
    return { traceId: raw.trim(), spanId: generateSpanId(), flags: '01' }
  }

  return generateTraceContext()
}

/**
 * 生成出站请求应携带的 trace 相关头（供内部 HTTP 客户端传播使用）
 *
 * 在当前请求上下文存在时，返回 `{ traceparent, 'x-trace-id' }`；
 * 无活跃上下文时返回空对象（调用方按原逻辑处理）。
 */
export function createOutboundTraceHeaders(): Record<string, string> {
  const ctx = traceStorage.getStore()
  if (!ctx) {
    return {}
  }
  return {
    [TRACE_PARENT_HEADER]: formatTraceParent(ctx),
    [TRACE_ID_HEADER]: ctx.traceId,
  }
}

/**
 * 从请求 headers 中提取 traceId（兼容旧 API，行为不变）
 * 优先 traceparent，其次 x-trace-id，最后生成新的。
 *
 * @param headers 请求头对象
 * @returns traceId 字符串
 */
export function extractTraceId(headers: HeaderBag): string {
  return extractTraceContext(headers).traceId
}

/**
 * 设置当前请求上下文（供非 HTTP 场景或异步任务使用）
 *
 * 在 AsyncLocalStorage 上下文内运行时，设置当前上下文的 traceId（spanId 重新生成）；
 * 若无活跃上下文则静默忽略（避免非请求场景报错）。
 */
export function setTraceId(traceId: string): void {
  const store = traceStorage.getStore()
  if (store !== undefined) {
    traceStorage.enterWith({ traceId, spanId: generateSpanId(), flags: store.flags || '01' })
  }
}

/**
 * 获取当前请求上下文
 *
 * 从 AsyncLocalStorage 获取当前请求的 TraceContext；
 * 若不在任何请求上下文中（如启动阶段），返回 undefined。
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore()
}

/**
 * 获取当前请求上下文的 traceId（兼容旧 API）
 *
 * 从 AsyncLocalStorage 获取当前请求的 traceId；
 * 若不在任何请求上下文中（如启动阶段），返回 undefined。
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId
}

/**
 * 获取当前请求上下文的 spanId
 *
 * 若不在任何请求上下文中（如启动阶段），返回 undefined。
 */
export function getSpanId(): string | undefined {
  return traceStorage.getStore()?.spanId
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
    traceStorage.enterWith(undefined as unknown as TraceContext)
  }
}
