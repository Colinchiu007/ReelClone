/**
 * 全局异常过滤器
 *
 * 捕获所有未处理的异常，统一转为 ApiResponse 格式响应：
 * - BusinessException：使用其携带的 code、message、details
 * - HttpException：映射 HTTP 状态码到业务错误码
 * - class-validator 校验异常：提取字段级错误信息
 * - 其他未知异常：归为 INTERNAL_ERROR（5000）
 *
 * 同时记录日志：5xx 用 error 级别（含堆栈），4xx 用 warn 级别。
 *
 * 全局注册：
 * ```ts
 * app.useGlobalFilters(new AllExceptionsFilter())
 * ```
 */
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ErrorCode, ErrorCodeMessages } from '../enums/error-code.enum'
import { BusinessException } from '../exceptions/business.exception'
import { type ApiResponse } from '../types/api-response'
import {
  RESPONSE_TRACE_ID_HEADER,
  extractTraceId,
  generateTraceId,
} from '../utils/tracing.util'

/** 请求对象的最小结构 */
interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>
  method?: string
  url?: string
}

/** 响应对象的最小结构 */
interface MinimalResponse {
  setHeader: (name: string, value: string) => void
  status: (code: number) => { json: (body: unknown) => void }
}

/**
 * HTTP 状态码到业务错误码的映射
 */
function mapHttpStatusToErrorCode(httpStatus: number): ErrorCode {
  switch (httpStatus) {
    case HttpStatus.UNAUTHORIZED:
      return ErrorCode.UNAUTHORIZED
    case HttpStatus.FORBIDDEN:
      return ErrorCode.FORBIDDEN
    case HttpStatus.NOT_FOUND:
      return ErrorCode.NOT_FOUND
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ErrorCode.VALIDATION_ERROR
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCode.RATE_LIMITED
    default:
      return httpStatus >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_ERROR
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<MinimalResponse>()
    const request = ctx.getRequest<MinimalRequest>()

    // 提取或生成 traceId
    const traceId = extractTraceId(request.headers) ?? generateTraceId()
    response.setHeader(RESPONSE_TRACE_ID_HEADER, traceId)

    let code: number = ErrorCode.INTERNAL_ERROR
    let message: string = ErrorCodeMessages[ErrorCode.INTERNAL_ERROR]
    let httpStatus: number = HttpStatus.INTERNAL_SERVER_ERROR
    let details: unknown

    // -------------------- 1. 业务异常 --------------------
    if (exception instanceof BusinessException) {
      code = exception.code
      message = exception.message
      details = exception.details
      httpStatus = exception.getStatus()
    }
    // -------------------- 2. HTTP 异常（含校验异常） --------------------
    else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      code = mapHttpStatusToErrorCode(httpStatus)
      const resp = exception.getResponse()

      if (typeof resp === 'string') {
        message = resp
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>
        // class-validator 校验异常：message 为数组
        if (Array.isArray(r.message)) {
          code = ErrorCode.VALIDATION_ERROR
          message = '参数校验失败'
          details = { errors: r.message }
        } else if (typeof r.message === 'string') {
          message = r.message
        }
        // 若响应体已包含 code，则优先使用
        if (typeof r.code === 'number') {
          code = r.code
        }
      }
    }
    // -------------------- 3. 原生 Error --------------------
    else if (exception instanceof Error) {
      message = exception.message || message
    }

    // -------------------- 记录日志 --------------------
    const requestInfo = `${request.method ?? ''} ${request.url ?? ''}`
    if (httpStatus >= 500) {
      this.logger.error(
        `[${traceId}] ${requestInfo} → ${code} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(`[${traceId}] ${requestInfo} → ${code} ${message}`)
    }

    // -------------------- 返回统一响应 --------------------
    const body: ApiResponse<unknown> = {
      code,
      message,
      data: details ?? null,
      traceId,
    }

    response.status(httpStatus).json(body)
  }
}
