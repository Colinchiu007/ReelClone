/**
 * business.exception 单元测试
 */
import { HttpStatus } from '@nestjs/common'
import { BusinessException } from './business.exception'
import { ErrorCode } from '../enums/error-code.enum'

describe('BusinessException', () => {
  describe('构造函数', () => {
    it('应正确携带 code、message、details', () => {
      const details = { field: 'url', value: 'invalid' }
      const ex = new BusinessException(ErrorCode.VALIDATION_ERROR, '参数错误', details)
      expect(ex.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(ex.message).toBe('参数错误')
      expect(ex.details).toEqual(details)
    })

    it('默认 HTTP 状态码应为 400', () => {
      const ex = new BusinessException(ErrorCode.TASK_FAILED, '失败')
      expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST)
    })

    it('应支持自定义 HTTP 状态码', () => {
      const ex = new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '未登录',
        undefined,
        HttpStatus.UNAUTHORIZED,
      )
      expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('details 可选', () => {
      const ex = new BusinessException(ErrorCode.NOT_FOUND, '不存在')
      expect(ex.details).toBeUndefined()
    })
  })

  describe('快捷工厂方法', () => {
    it('unauthorized 应返回 401 状态码和对应 code', () => {
      const ex = BusinessException.unauthorized()
      expect(ex.code).toBe(ErrorCode.UNAUTHORIZED)
      expect(ex.getStatus()).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('forbidden 应返回 403 状态码和对应 code', () => {
      const ex = BusinessException.forbidden()
      expect(ex.code).toBe(ErrorCode.FORBIDDEN)
      expect(ex.getStatus()).toBe(HttpStatus.FORBIDDEN)
    })

    it('notFound 应返回 404 状态码并在消息中包含资源名', () => {
      const ex = BusinessException.notFound('视频')
      expect(ex.code).toBe(ErrorCode.NOT_FOUND)
      expect(ex.getStatus()).toBe(HttpStatus.NOT_FOUND)
      expect(ex.message).toContain('视频')
    })

    it('validationError 应返回 422 状态码', () => {
      const ex = BusinessException.validationError()
      expect(ex.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(ex.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY)
    })

    it('insufficientCredits 应返回积分不足 code', () => {
      const ex = BusinessException.insufficientCredits()
      expect(ex.code).toBe(ErrorCode.INSUFFICIENT_CREDITS)
    })

    it('taskFailed 应返回任务失败 code 和 500 状态码', () => {
      const ex = BusinessException.taskFailed()
      expect(ex.code).toBe(ErrorCode.TASK_FAILED)
      expect(ex.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR)
    })

    it('paymentFailed 应返回支付失败 code', () => {
      const ex = BusinessException.paymentFailed()
      expect(ex.code).toBe(ErrorCode.PAYMENT_FAILED)
    })

    it('contentRejected 应返回内容被拒 code', () => {
      const ex = BusinessException.contentRejected()
      expect(ex.code).toBe(ErrorCode.CONTENT_REJECTED)
    })

    it('rateLimited 应返回 429 状态码和限流 code', () => {
      const ex = BusinessException.rateLimited()
      expect(ex.code).toBe(ErrorCode.RATE_LIMITED)
      expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    })
  })

  describe('应可作为 HttpException 被 NestJS 处理', () => {
    it('getResponse 应返回包含 code 和 message 的对象', () => {
      const ex = new BusinessException(ErrorCode.NOT_FOUND, '不存在', { id: '123' })
      const resp = ex.getResponse() as Record<string, unknown>
      expect(resp.code).toBe(ErrorCode.NOT_FOUND)
      expect(resp.message).toBe('不存在')
      expect(resp.details).toEqual({ id: '123' })
    })
  })
})
