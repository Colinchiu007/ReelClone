/**
 * tracing.util 单元测试
 *
 * setTraceId / getTraceId / clearTraceId 基于 AsyncLocalStorage，
 * 需要通过 traceStorage.run() 创建上下文后才能测试。
 *
 * 覆盖：
 *  - generateTraceId / generateSpanId / generateTraceContext
 *  - parseTraceParent / formatTraceParent（W3C traceparent）
 *  - extractTraceContext（traceparent → x-trace-id → 全新生成）
 *  - extractTraceId（legacy 兼容）
 *  - createOutboundTraceHeaders（出站传播）
 *  - AsyncLocalStorage 上下文隔离
 */
import {
  clearTraceId,
  generateTraceContext,
  generateSpanId,
  generateTraceId,
  getSpanId,
  getTraceContext,
  getTraceId,
  setTraceId,
  extractTraceId,
  extractTraceContext,
  createOutboundTraceHeaders,
  parseTraceParent,
  formatTraceParent,
  traceStorage,
  TRACE_ID_HEADER,
  TRACE_PARENT_HEADER,
  type TraceContext,
} from './tracing.util'

/** 构造一个合法的测试 TraceContext */
function makeCtx(overrides: Partial<TraceContext> = {}): TraceContext {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    flags: '01',
    ...overrides,
  }
}

describe('tracing.util', () => {
  describe('generateTraceId', () => {
    it('应生成 32 字符的 hex 字符串', () => {
      const traceId = generateTraceId()
      expect(traceId).toHaveLength(32)
      expect(traceId).toMatch(/^[0-9a-f]{32}$/)
    })

    it('每次调用应生成不同的 traceId', () => {
      const a = generateTraceId()
      const b = generateTraceId()
      expect(a).not.toBe(b)
    })
  })

  describe('generateSpanId', () => {
    it('应生成 16 字符的 hex 字符串', () => {
      const spanId = generateSpanId()
      expect(spanId).toHaveLength(16)
      expect(spanId).toMatch(/^[0-9a-f]{16}$/)
    })

    it('每次调用应生成不同的 spanId', () => {
      const a = generateSpanId()
      const b = generateSpanId()
      expect(a).not.toBe(b)
    })
  })

  describe('generateTraceContext', () => {
    it('应生成合法且 sampled 的 TraceContext', () => {
      const ctx = generateTraceContext()
      expect(parseTraceParent(formatTraceParent(ctx))).toEqual(ctx)
      expect(ctx.flags).toBe('01')
    })
  })

  describe('parseTraceParent / formatTraceParent', () => {
    const valid = `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`

    it('应正确解析合法 traceparent', () => {
      expect(parseTraceParent(valid)).toEqual({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        flags: '01',
      })
    })

    it('formatTraceParent 与 parseTraceParent 应往返一致', () => {
      const ctx = makeCtx()
      expect(parseTraceParent(formatTraceParent(ctx))).toEqual(ctx)
    })

    it('应拒绝段数不足的 traceparent', () => {
      expect(parseTraceParent(`00-${'a'.repeat(32)}-${'b'.repeat(16)}`)).toBeNull()
    })

    it('应拒绝非 00 版本号', () => {
      expect(parseTraceParent(`ff-${'a'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeNull()
    })

    it('应拒绝 traceId 长度不足 32', () => {
      expect(parseTraceParent(`00-${'a'.repeat(31)}-${'b'.repeat(16)}-01`)).toBeNull()
    })

    it('应拒绝 traceId 含非法字符', () => {
      expect(parseTraceParent(`00-${'g'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeNull()
    })

    it('应拒绝全零 traceId', () => {
      expect(parseTraceParent(`00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`)).toBeNull()
    })

    it('应拒绝 spanId 长度不足 16', () => {
      expect(parseTraceParent(`00-${'a'.repeat(32)}-${'b'.repeat(15)}-01`)).toBeNull()
    })

    it('应拒绝全零 spanId', () => {
      expect(parseTraceParent(`00-${'a'.repeat(32)}-${'0'.repeat(16)}-01`)).toBeNull()
    })

    it('应拒绝非法 flags', () => {
      expect(parseTraceParent(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-xx`)).toBeNull()
    })

    it('应拒绝非字符串输入', () => {
      expect(parseTraceParent(undefined as unknown as string)).toBeNull()
    })

    it('应容忍首尾空白', () => {
      expect(parseTraceParent(`  ${valid}  `)).toEqual({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        flags: '01',
      })
    })
  })

  describe('extractTraceContext', () => {
    it('应优先采纳合法的 traceparent（保留上层 spanId）', () => {
      const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`
      const ctx = extractTraceContext({ [TRACE_PARENT_HEADER]: tp, [TRACE_ID_HEADER]: 'ignored' })
      expect(ctx.traceId).toBe('c'.repeat(32))
      expect(ctx.spanId).toBe('d'.repeat(16))
    })

    it('traceparent 非法时应回退到 x-trace-id', () => {
      const ctx = extractTraceContext({
        [TRACE_PARENT_HEADER]: 'invalid-traceparent',
        [TRACE_ID_HEADER]: 'abc123',
      })
      expect(ctx.traceId).toBe('abc123')
      expect(ctx.spanId).toMatch(/^[0-9a-f]{16}$/)
    })

    it('仅有 x-trace-id 时应以其为 traceId 并生成新 spanId', () => {
      const ctx = extractTraceContext({ [TRACE_ID_HEADER]: 'legacy-trace-id' })
      expect(ctx.traceId).toBe('legacy-trace-id')
      expect(ctx.spanId).toHaveLength(16)
    })

    it('两者皆无时应生成全新 TraceContext', () => {
      const ctx = extractTraceContext({})
      expect(ctx.traceId).toHaveLength(32)
      expect(ctx.spanId).toHaveLength(16)
      expect(ctx.flags).toBe('01')
    })

    it('应支持小写 header 字段名', () => {
      const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`
      const ctx = extractTraceContext({ [TRACE_PARENT_HEADER.toLowerCase()]: tp })
      expect(ctx.traceId).toBe('c'.repeat(32))
    })
  })

  describe('extractTraceId（legacy 兼容）', () => {
    it('当 header 中存在 traceId 时应提取它', () => {
      const traceId = 'abc123traceid'
      const headers = { [TRACE_ID_HEADER]: traceId }
      expect(extractTraceId(headers)).toBe(traceId)
    })

    it('当 header 中 traceId 为空字符串时应生成新的', () => {
      const headers = { [TRACE_ID_HEADER]: '' }
      const result = extractTraceId(headers)
      expect(result).toHaveLength(32)
    })

    it('当 header 中不存在 traceId 时应生成新的', () => {
      const headers = {}
      const result = extractTraceId(headers)
      expect(result).toHaveLength(32)
    })

    it('应支持小写 header 字段名', () => {
      const traceId = 'lowercase-trace-id'
      const headers = { [TRACE_ID_HEADER.toLowerCase()]: traceId }
      expect(extractTraceId(headers)).toBe(traceId)
    })

    it('应去除首尾空白字符', () => {
      const headers = { [TRACE_ID_HEADER]: '  spaced-trace-id  ' }
      expect(extractTraceId(headers)).toBe('spaced-trace-id')
    })

    it('应优先读取 traceparent 中的 traceId', () => {
      const tp = `00-${'c'.repeat(32)}-${'d'.repeat(16)}-01`
      const headers = { [TRACE_PARENT_HEADER]: tp, [TRACE_ID_HEADER]: 'x' }
      expect(extractTraceId(headers)).toBe('c'.repeat(32))
    })
  })

  describe('createOutboundTraceHeaders（出站传播）', () => {
    it('上下文存在时应生成 traceparent 与 x-trace-id', () => {
      const ctx = makeCtx()
      traceStorage.run(ctx, () => {
        const headers = createOutboundTraceHeaders()
        expect(headers).toEqual({
          [TRACE_PARENT_HEADER]: formatTraceParent(ctx),
          [TRACE_ID_HEADER]: ctx.traceId,
        })
      })
    })

    it('无上下文时应返回空对象', () => {
      traceStorage.run(undefined as unknown as TraceContext, () => {
        expect(createOutboundTraceHeaders()).toEqual({})
      })
    })
  })

  describe('上下文 TraceContext（AsyncLocalStorage）', () => {
    it('setTraceId / getTraceId 应正确存取', () => {
      traceStorage.run(makeCtx({ traceId: 'initial-id' }), () => {
        setTraceId('ctx-trace-id')
        expect(getTraceId()).toBe('ctx-trace-id')
        expect(getTraceContext()?.flags).toBe('01')
      })
    })

    it('setTraceId 应重新生成 spanId 但不改变 flags', () => {
      traceStorage.run(makeCtx({ traceId: 'initial-id', spanId: 'old-span', flags: '01' }), () => {
        setTraceId('new-trace-id')
        expect(getTraceId()).toBe('new-trace-id')
        expect(getSpanId()).not.toBe('old-span')
      })
    })

    it('clearTraceId 后 getTraceId 应返回 undefined', () => {
      traceStorage.run(makeCtx({ traceId: 'to-be-cleared' }), () => {
        setTraceId('ctx-trace-id')
        clearTraceId()
        expect(getTraceId()).toBeUndefined()
      })
    })

    it('不在上下文中时 getTraceId / getTraceContext 应返回 undefined', () => {
      // 不在 traceStorage.run 内调用
      expect(getTraceId()).toBeUndefined()
      expect(getTraceContext()).toBeUndefined()
      expect(getSpanId()).toBeUndefined()
    })

    it('并发请求间 traceName 应互不干扰', async () => {
      const results: string[] = []

      const task1 = traceStorage.run(makeCtx({ traceId: 'trace-A' }), async () => {
        setTraceId('trace-A')
        await new Promise((r) => setTimeout(r, 10))
        results.push(`1:${getTraceId()}`)
      })

      const task2 = traceStorage.run(makeCtx({ traceId: 'trace-B' }), async () => {
        setTraceId('trace-B')
        await new Promise((r) => setTimeout(r, 5))
        results.push(`2:${getTraceId()}`)
      })

      await Promise.all([task1, task2])

      expect(results).toContain('1:trace-A')
      expect(results).toContain('2:trace-B')
    })
  })
})
