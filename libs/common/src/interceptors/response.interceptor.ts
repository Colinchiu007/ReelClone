/**
 * 统一响应拦截器
 *
 * 将控制器返回值自动包装为 ApiResponse 格式：{ code, message, data, traceId }
 * - 从请求 header（x-trace-id）提取 traceId，未携带则生成 uuid
 * - 将 traceId 注入响应 header，便于客户端关联日志
 * - 若返回值已是 ApiResponse 格式（含 code 字段），则补全 traceId 后透传
 *
 * 全局注册：
 * ```ts
 * app.useGlobalInterceptors(new ResponseInterceptor())
 * ```
 */
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { type Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ErrorCode } from '../enums/error-code.enum'
import { SKIP_RESPONSE_INTERCEPTOR_KEY } from '../decorators/skip-response-interceptor.decorator'
import { type ApiResponse } from '../types/api-response'
import {
  RESPONSE_TRACE_ID_HEADER,
  TRACE_ID_HEADER,
  TRACE_PARENT_HEADER,
  extractTraceContext,
  formatTraceParent,
  traceStorage,
} from '../utils/tracing.util'

/** 请求对象的最小结构 */
interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>
}

/** 响应对象的最小结构 */
interface MinimalResponse {
  setHeader: (name: string, value: string) => void
}

/** 判断返回值是否已经是 ApiResponse 结构 */
function isApiResponse(value: unknown): value is ApiResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'data' in value
  )
}

@Injectable()
export class ResponseInterceptor<T = unknown> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<MinimalRequest>()
    const response = context.switchToHttp().getResponse<MinimalResponse>()

    // 提取或生成 TraceContext（优先 W3C traceparent，兼容 legacy x-trace-id）
    const traceCtx = extractTraceContext(request.headers)
    const traceId = traceCtx.traceId
    // 回写请求 header，供后续日志/守卫等使用
    request.headers[TRACE_ID_HEADER] = traceId
    request.headers[TRACE_PARENT_HEADER] = formatTraceParent(traceCtx)
    // 注入响应 header（x-trace-id 保持前端兼容，traceparent 遵循 W3C 标准）
    response.setHeader(RESPONSE_TRACE_ID_HEADER, traceId)
    response.setHeader(TRACE_PARENT_HEADER, formatTraceParent(traceCtx))

    // 检查是否标记跳过响应包装（如微信支付回调需要原始格式响应）
    const skipWrap =
      this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_INTERCEPTOR_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false

    // 将 TraceContext 注入 AsyncLocalStorage 上下文，
    // 使得整个请求处理链（service / util / 异步回调）都能通过 getTraceContext()/getTraceId() 获取
    return traceStorage.run(traceCtx, () =>
      next.handle().pipe(
        map((data) => {
          // 跳过响应包装：直接返回原始数据（仍注入 traceId header）
          if (skipWrap) {
            return data as unknown as ApiResponse<T>
          }
          // 已是 ApiResponse 格式则补全 traceId
          if (isApiResponse(data)) {
            return { ...data, traceId } as ApiResponse<T>
          }
          // 包装为统一响应
          return {
            code: ErrorCode.SUCCESS,
            message: 'success',
            data,
            traceId,
          } as ApiResponse<T>
        }),
      ),
    )
  }
}
