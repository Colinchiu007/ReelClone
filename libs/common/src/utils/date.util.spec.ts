/**
 * date.util 单元测试
 */
import {
  formatDate,
  toISOString,
  parseDate,
  diffMilliseconds,
  diffSeconds,
  isExpired,
  addTime,
  currentTimestamp,
  now,
  DEFAULT_TIMEZONE,
  DATETIME_FORMAT,
  DATE_FORMAT,
} from './date.util'

describe('date.util', () => {
  // 固定测试时间：2025-01-15 10:30:00 UTC
  const testDate = new Date('2025-01-15T10:30:00.000Z')

  describe('now / currentTimestamp', () => {
    it('now 应返回 Dayjs 对象', () => {
      const result = now()
      expect(result).toBeDefined()
      expect(typeof result.unix()).toBe('number')
    })

    it('currentTimestamp 应返回秒级时间戳', () => {
      const ts = currentTimestamp()
      expect(typeof ts).toBe('number')
      // 与 Date.now() 误差不超过 2 秒
      expect(Math.abs(ts - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(2)
    })
  })

  describe('formatDate', () => {
    it('应使用默认格式格式化日期', () => {
      const result = formatDate(testDate)
      // UTC 2025-01-15 10:30:00 在本地时区格式化，检查日期部分
      expect(result).toMatch(/2025-01-15/)
    })

    it('应支持自定义格式', () => {
      const result = formatDate(testDate, DATE_FORMAT)
      expect(result).toBe('2025-01-15')
    })

    it('应支持时间戳输入', () => {
      const result = formatDate(testDate.getTime(), DATE_FORMAT)
      expect(result).toBe('2025-01-15')
    })
  })

  describe('toISOString', () => {
    it('应返回 ISO 8601 格式字符串', () => {
      const result = toISOString(testDate)
      expect(result).toBe('2025-01-15T10:30:00.000Z')
    })
  })

  describe('parseDate', () => {
    it('应解析 ISO 字符串', () => {
      const result = parseDate('2025-01-15T10:30:00.000Z')
      expect(result.toISOString()).toBe('2025-01-15T10:30:00.000Z')
    })

    it('应按指定格式解析', () => {
      const result = parseDate('2025-01-15', 'YYYY-MM-DD')
      expect(result.year()).toBe(2025)
      expect(result.month()).toBe(0) // 0 = January
      expect(result.date()).toBe(15)
    })
  })

  describe('diffMilliseconds / diffSeconds', () => {
    it('应正确计算毫秒差', () => {
      const start = new Date('2025-01-15T10:00:00.000Z')
      const end = new Date('2025-01-15T10:00:05.000Z')
      expect(diffMilliseconds(start, end)).toBe(5000)
    })

    it('应正确计算秒差', () => {
      const start = new Date('2025-01-15T10:00:00.000Z')
      const end = new Date('2025-01-15T10:01:00.000Z')
      expect(diffSeconds(start, end)).toBe(60)
    })
  })

  describe('isExpired', () => {
    it('过去的时间应判定为已过期', () => {
      const past = new Date('2020-01-01T00:00:00.000Z')
      expect(isExpired(past, testDate)).toBe(true)
    })

    it('未来的时间应判定为未过期', () => {
      const future = new Date('2030-01-01T00:00:00.000Z')
      expect(isExpired(future, testDate)).toBe(false)
    })
  })

  describe('addTime', () => {
    it('应正确增加天数', () => {
      const result = addTime(testDate, 1, 'day')
      expect(result.toISOString()).toBe('2025-01-16T10:30:00.000Z')
    })

    it('应正确增加小时', () => {
      const result = addTime(testDate, 2, 'hour')
      expect(result.toISOString()).toBe('2025-01-15T12:30:00.000Z')
    })
  })

  describe('常量', () => {
    it('DEFAULT_TIMEZONE 应为 Asia/Shanghai', () => {
      expect(DEFAULT_TIMEZONE).toBe('Asia/Shanghai')
    })

    it('DATETIME_FORMAT 应包含日期和时间占位符', () => {
      expect(DATETIME_FORMAT).toContain('YYYY')
      expect(DATETIME_FORMAT).toContain('HH')
    })
  })
})
