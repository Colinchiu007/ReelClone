/**
 * MetricsModule — Prometheus 指标模块
 *
 * 用法：
 * ```ts
 * @Module({
 *   imports: [MetricsModule.forRoot()],
 *   providers: [
 *     { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * 注册的指标：
 *  - http_requests_total{method, route, status} — HTTP 请求总数（Counter）
 *  - http_request_duration_seconds{method, route, status} — HTTP 请求耗时直方图（Histogram）
 *  - nodejs_heap_size_total_bytes — Node.js 堆内存（default metrics）
 *  - process_cpu_seconds_total — 进程 CPU 时间（default metrics）
 *
 * default metrics 还包含：eventloop lag、GC duration、heap space 等标准指标。
 */
import { type DynamicModule, Global, Module, type Provider } from '@nestjs/common'
import {
  Counter,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client'
import { HttpMetricsInterceptor } from './http.interceptor'
import { MetricsController } from './metrics.controller'

/** HTTP 请求总数 Counter 的注入 Token */
export const HTTP_REQUESTS_TOTAL = 'http_requests_total'

/** HTTP 请求耗时 Histogram 的注入 Token */
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds'

export interface MetricsModuleOptions {
  /** 服务名（保留用于后续按服务标签区分，当前可选） */
  serviceName?: string
}

/** 获取或创建 Counter，避免重复注册（HMR / 多次 forRoot 场景） */
function getOrCreateCounter(
  name: string,
  help: string,
  labelNames: string[],
): Counter<string> {
  const existing = register.getSingleMetric(name)
  if (existing) {
    return existing as Counter<string>
  }
  return new Counter<string>({ name, help, labelNames })
}

/** 获取或创建 Histogram，避免重复注册 */
function getOrCreateHistogram(
  name: string,
  help: string,
  labelNames: string[],
  buckets?: number[],
): Histogram<string> {
  const existing = register.getSingleMetric(name)
  if (existing) {
    return existing as Histogram<string>
  }
  return new Histogram<string>({ name, help, labelNames, buckets })
}

@Global()
@Module({})
export class MetricsModule {
  static forRoot(_options: MetricsModuleOptions = {}): DynamicModule {
    // 注册默认指标（含 nodejs_heap_size_total_bytes, process_cpu_seconds_total 等）
    collectDefaultMetrics()

    // HTTP 请求总数 Counter
    const httpRequestTotal = getOrCreateCounter(
      HTTP_REQUESTS_TOTAL,
      'Total number of HTTP requests',
      ['method', 'route', 'status'],
    )

    // HTTP 请求耗时 Histogram（单位：秒）
    const httpRequestDuration = getOrCreateHistogram(
      HTTP_REQUEST_DURATION_SECONDS,
      'HTTP request duration in seconds',
      ['method', 'route', 'status'],
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    )

    const providers: Provider[] = [
      { provide: HTTP_REQUESTS_TOTAL, useValue: httpRequestTotal },
      { provide: HTTP_REQUEST_DURATION_SECONDS, useValue: httpRequestDuration },
      HttpMetricsInterceptor,
    ]

    return {
      module: MetricsModule,
      controllers: [MetricsController],
      providers,
      exports: [HttpMetricsInterceptor],
    }
  }
}
