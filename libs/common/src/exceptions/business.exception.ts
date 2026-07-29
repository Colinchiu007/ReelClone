/**
 * 业务异常类
 *
 * 统一封装业务错误，携带 code（业务错误码）、message（提示信息）、details（错误详情）。
 * 被 AllExceptionsFilter 捕获后转为统一响应格式。
 */
import { HttpException, HttpStatus } from '@nestjs/common'
import { ErrorCode } from '../enums/error-code.enum'

/**
 * 业务异常详情
 * 用于向客户端返回更细粒度的错误信息（如字段级校验错误）
 */
export interface BusinessExceptionDetails {
  /** 出错的字段名（可选） */
  field?: string
  /** 出错的值（可选） */
  value?: unknown
  /** 额外上下文信息 */
  [key: string]: unknown
}

/**
 * 业务异常
 *
 * @example
 * ```ts
 * throw new BusinessException(ErrorCode.INSUFFICIENT_CREDITS, '积分不足，请充值')
 * throw new BusinessException(ErrorCode.VALIDATION_ERROR, '参数错误', { field: 'url', value: 'xxx' })
 * ```
 */
export class BusinessException extends HttpException {
  /** 业务错误码（对应 ErrorCode 枚举） */
  readonly code: number

  /** 错误详情 */
  readonly details?: BusinessExceptionDetails

  constructor(
    code: ErrorCode,
    message: string,
    details?: BusinessExceptionDetails,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message, details }, httpStatus)
    this.code = code
    this.details = details
  }

  // -------------------- 快捷工厂方法 --------------------

  /** 未授权（401） */
  static unauthorized(
    message = '未授权访问，请先登录',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.UNAUTHORIZED, message, details, HttpStatus.UNAUTHORIZED)
  }

  /** 禁止访问（403） */
  static forbidden(
    message = '权限不足，禁止访问',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.FORBIDDEN, message, details, HttpStatus.FORBIDDEN)
  }

  /** 资源不存在（404） */
  static notFound(
    resource = '资源',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(
      ErrorCode.NOT_FOUND,
      `${resource}不存在`,
      details,
      HttpStatus.NOT_FOUND,
    )
  }

  /** 参数校验错误（422） */
  static validationError(
    message = '参数校验失败',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(
      ErrorCode.VALIDATION_ERROR,
      message,
      details,
      HttpStatus.UNPROCESSABLE_ENTITY,
    )
  }

  /** 积分不足（4001） */
  static insufficientCredits(
    message = '积分不足，请充值',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.INSUFFICIENT_CREDITS, message, details, HttpStatus.BAD_REQUEST)
  }

  /** 任务失败（4002） */
  static taskFailed(
    message = '任务执行失败',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.TASK_FAILED, message, details, HttpStatus.INTERNAL_SERVER_ERROR)
  }

  /** 支付失败（4003） */
  static paymentFailed(
    message = '支付失败',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.PAYMENT_FAILED, message, details, HttpStatus.BAD_REQUEST)
  }

  /** 内容被拒（4004） */
  static contentRejected(
    message = '内容未通过合规审查',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(ErrorCode.CONTENT_REJECTED, message, details, HttpStatus.BAD_REQUEST)
  }

  /** 限流（429） */
  static rateLimited(
    message = '请求过于频繁，请稍后重试',
    details?: BusinessExceptionDetails,
  ): BusinessException {
    return new BusinessException(
      ErrorCode.RATE_LIMITED,
      message,
      details,
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }
}
