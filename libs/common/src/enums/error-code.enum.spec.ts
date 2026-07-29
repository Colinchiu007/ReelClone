/**
 * error-code.enum 单元测试
 */
import { ErrorCode, ErrorCodeMessages } from './error-code.enum'

describe('error-code.enum', () => {
  describe('ErrorCode 枚举值', () => {
    it('SUCCESS 应为 0', () => {
      expect(ErrorCode.SUCCESS).toBe(0)
    })

    it('HTTP 标准错误码应对齐 HTTP 状态码', () => {
      expect(ErrorCode.UNAUTHORIZED).toBe(401)
      expect(ErrorCode.FORBIDDEN).toBe(403)
      expect(ErrorCode.NOT_FOUND).toBe(404)
      expect(ErrorCode.VALIDATION_ERROR).toBe(422)
      expect(ErrorCode.RATE_LIMITED).toBe(429)
    })

    it('业务错误码应以 4 开头', () => {
      expect(ErrorCode.INSUFFICIENT_CREDITS).toBe(4001)
      expect(ErrorCode.TASK_FAILED).toBe(4002)
      expect(ErrorCode.PAYMENT_FAILED).toBe(4003)
      expect(ErrorCode.CONTENT_REJECTED).toBe(4004)
    })

    it('内部错误码应以 5 开头', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe(5000)
    })

    it('所有枚举值应唯一', () => {
      const values = Object.values(ErrorCode).filter((v): v is number => typeof v === 'number')
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })
  })

  describe('ErrorCodeMessages', () => {
    it('应为每个错误码提供默认提示信息', () => {
      const codes = Object.values(ErrorCode).filter((v): v is number => typeof v === 'number')
      for (const code of codes) {
        expect(ErrorCodeMessages[code]).toBeDefined()
        expect(typeof ErrorCodeMessages[code]).toBe('string')
        expect(ErrorCodeMessages[code].length).toBeGreaterThan(0)
      }
    })

    it('SUCCESS 的提示信息应为 success', () => {
      expect(ErrorCodeMessages[ErrorCode.SUCCESS]).toBe('success')
    })
  })
})
