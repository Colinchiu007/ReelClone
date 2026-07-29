/**
 * idempotency.util 单元测试
 */
import {
  extractIdempotencyKey,
  generateIdempotencyKey,
  buildIdempotencyRedisKey,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_REDIS_PREFIX,
} from './idempotency.util'

describe('idempotency.util', () => {
  describe('extractIdempotencyKey', () => {
    it('当 header 中存在幂等键时应提取它', () => {
      const key = 'my-idempotency-key-123'
      const headers = { [IDEMPOTENCY_KEY_HEADER]: key }
      expect(extractIdempotencyKey(headers)).toBe(key)
    })

    it('当 header 中幂等键为空时应返回 undefined', () => {
      const headers = { [IDEMPOTENCY_KEY_HEADER]: '' }
      expect(extractIdempotencyKey(headers)).toBeUndefined()
    })

    it('当 header 中不存在幂等键时应返回 undefined', () => {
      const headers = {}
      expect(extractIdempotencyKey(headers)).toBeUndefined()
    })

    it('应去除首尾空白字符', () => {
      const headers = { [IDEMPOTENCY_KEY_HEADER]: '  key-with-spaces  ' }
      expect(extractIdempotencyKey(headers)).toBe('key-with-spaces')
    })

    it('应支持小写 header 字段名', () => {
      const key = 'lower-case-key'
      const headers = { [IDEMPOTENCY_KEY_HEADER.toLowerCase()]: key }
      expect(extractIdempotencyKey(headers)).toBe(key)
    })
  })

  describe('generateIdempotencyKey', () => {
    it('应生成包含前缀、用户 ID、动作的键', () => {
      const key = generateIdempotencyKey('user-1', 'create_video')
      expect(key).toContain(IDEMPOTENCY_REDIS_PREFIX)
      expect(key).toContain('user-1')
      expect(key).toContain('create_video')
    })

    it('相同用户、动作、载荷应生成相同的哈希部分', () => {
      const payload = { url: 'https://example.com', type: 'mp4' }
      const key1 = generateIdempotencyKey('user-1', 'create_video', payload)
      const key2 = generateIdempotencyKey('user-1', 'create_video', payload)
      // 时间戳可能不同，但哈希部分（倒数第二段）应相同
      const parts1 = key1.split(':')
      const parts2 = key2.split(':')
      expect(parts1[3]).toBe(parts2[3]) // payloadHash 段
    })

    it('不同载荷应生成不同的哈希部分', () => {
      const key1 = generateIdempotencyKey('user-1', 'create_video', { a: 1 })
      const key2 = generateIdempotencyKey('user-1', 'create_video', { a: 2 })
      const parts1 = key1.split(':')
      const parts2 = key2.split(':')
      expect(parts1[3]).not.toBe(parts2[3])
    })

    it('不传载荷时应使用 nopayload 占位', () => {
      const key = generateIdempotencyKey('user-1', 'action')
      expect(key).toContain('nopayload')
    })
  })

  describe('buildIdempotencyRedisKey', () => {
    it('应添加 result 前缀', () => {
      const key = buildIdempotencyRedisKey('test-key')
      expect(key).toBe(`${IDEMPOTENCY_REDIS_PREFIX}:result:test-key`)
    })
  })
})
