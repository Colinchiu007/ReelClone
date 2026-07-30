/**
 * HttpMetricsInterceptor — HTTP 请求指标拦截器
 *
 * 自动记录每个 HTTP 请求的方法、路由、状态码和耗时，
 * 输出到 Prometheus Counter（http_requests_total）和 Histogram（http_request_duration_seconds）。
 *
 * 全局注册：
 * ```ts
 * import { APP_INTERCEPTOR } from '@nestjs/core'
 *
 * @Module({
 *   providers: [
 *     { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
 *   ],
 * })
 * ```
 *
 * 路由标签优先使用路由模板（如 /api/v1/users/:id），
 * 若无法获取则回退到 URL 路径（去除 query string），避免高基数。
 */
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import { type Observable, throwError } from 'rxjs'
import { catchError, tap } from 'rxjs/operators'
import { type Counter, type Histogram } from 'prom-client'
import { HTTP_REQUEST_DURATION_SECONDS, HTTP_REQUESTS_TOTAL } from './metrics.constants'

/** 请求对象的最小结构 */
interface MetricRequest {
  method?: string
  url?: string
  route?: { path?: string }
}

/** 响应对象的最小结构 */
interface MetricResponse {
  statusCode?: number
}

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @Inject(HTTP_REQUESTS_TOTAL)
    private readonly requestsTotal: Counter<string>,
    @Inject(HTTP_REQUEST_DURATION_SECONDS)
    private readonly requestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<MetricRequest>()
    const response = context.switchToHttp().getResponse<MetricResponse>()

    const method = request.method ?? 'UNKNOWN'
    // 优先使用路由模板（如 /users/:id），避免高基数
    const route = request.route?.path ?? request.url?.split('?')[0] ?? 'unknown'
    const start = process.hrtime.bigint()

    return next.handle().pipe(
      tap(() => {
        this.record(method, route, response.statusCode ?? 200, start)
      }),
      catchError((error: unknown) => {
        const status = (error as { status?: number })?.status ?? 500
        this.record(method, route, status, start)
        return throwError(() => error)
      }),
    )
  }

  private record(method: string, route: string, status: number, start: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9
    const labels = { method, route, status: String(status) }
    this.requestsTotal.inc(labels)
    this.requestDuration.observe(labels, durationSeconds)
  }
}
