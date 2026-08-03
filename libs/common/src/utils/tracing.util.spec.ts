/**
 * tracing.util 单元测试
 *
 * setTraceId / getTraceId / clearTraceId 基于 AsyncLocalStorage，
 * 需要通过 traceStorage.run() 创建上下文后才能测试。
 */
import {
  clearTraceId,
  generateTraceId,
  getTraceId,
  setTraceId,
  extractTraceId,
  traceStorage,
  TRACE_ID_HEADER,
} from './tracing.util'

describe('tracing.util', () => {
  describe('generateTraceId', () => {
    it('应生成 32 字符的 hex 字符串（去掉连字符的 uuid v4）', () => {
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

  describe('extractTraceId', () => {
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
  })

  describe('上下文 traceId（AsyncLocalStorage）', () => {
    it('setTraceId / getTraceId 应正确存取', () => {
      traceStorage.run('initial-id', () => {
        setTraceId('ctx-trace-id')
        expect(getTraceId()).toBe('ctx-trace-id')
      })
    })

    it('clearTraceId 后 getTraceId 应返回 undefined', () => {
      traceStorage.run('to-be-cleared', () => {
        setTraceId('ctx-trace-id')
        clearTraceId()
        expect(getTraceId()).toBeUndefined()
      })
    })

    it('不在上下文中时 getTraceId 应返回 undefined', () => {
      // 不在 traceStorage.run 内调用
      expect(getTraceId()).toBeUndefined()
    })

    it('并发请求间 traceId 应互不干扰', async () => {
      const results: string[] = []

      const task1 = traceStorage.run('trace-A', async () => {
        setTraceId('trace-A')
        await new Promise((r) => setTimeout(r, 10))
        results.push(`1:${getTraceId()}`)
      })

      const task2 = traceStorage.run('trace-B', async () => {
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
