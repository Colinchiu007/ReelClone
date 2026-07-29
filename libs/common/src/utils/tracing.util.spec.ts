/**
 * tracing.util 单元测试
 */
import {
  clearTraceId,
  generateTraceId,
  getTraceId,
  setTraceId,
  extractTraceId,
  TRACE_ID_HEADER,
} from './tracing.util'

describe('tracing.util', () => {
  afterEach(() => {
    clearTraceId()
  })

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

  describe('上下文 traceId', () => {
    it('setTraceId / getTraceId 应正确存取', () => {
      setTraceId('ctx-trace-id')
      expect(getTraceId()).toBe('ctx-trace-id')
    })

    it('clearTraceId 后 getTraceId 应返回 undefined', () => {
      setTraceId('ctx-trace-id')
      clearTraceId()
      expect(getTraceId()).toBeUndefined()
    })

    it('初始状态下 getTraceId 应返回 undefined', () => {
      expect(getTraceId()).toBeUndefined()
    })
  })
})
