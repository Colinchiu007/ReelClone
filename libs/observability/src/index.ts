/**
 * @reelclone/observability — ReelClone 可观测性库入口
 *
 * 统一导出：Pino 结构化日志、健康检查端点、Prometheus 指标暴露。
 * 所有业务微服务通过 `@reelclone/observability` 引入，保证可观测性能力一致。
 *
 * 典型用法：
 * ```ts
 * @Module({
 *   imports: [
 *     LoggerModule.forRoot({ serviceName: 'auth-service' }),
 *     HealthModule.forRoot(),
 *     MetricsModule.forRoot(),
 *   ],
 *   providers: [
 *     { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */

// -------------------- 共享 Token --------------------
export { OBS_SERVICE_NAME, OBS_LOG_LEVEL } from './logger/logger.config'

// -------------------- 日志 --------------------
export { LoggerService } from './logger/logger.service'
export { LoggerModule, type LoggerModuleOptions } from './logger/logger.module'
export {
  createLoggerConfig,
  type LoggerConfigOptions,
} from './logger/logger.config'

// -------------------- 健康检查 --------------------
export { HealthModule, type HealthModuleOptions } from './health/health.module'
export { HealthController, type HealthResponse } from './health/health.controller'
export {
  DatabaseHealthIndicator,
  RedisHealthIndicator,
  OBS_REDIS_CLIENT,
  type HealthResult,
} from './health/health.indicators'

// -------------------- Prometheus 指标 --------------------
export {
  MetricsModule,
  type MetricsModuleOptions,
  HTTP_REQUESTS_TOTAL,
  HTTP_REQUEST_DURATION_SECONDS,
} from './metrics/metrics.module'
export { MetricsController } from './metrics/metrics.controller'
export { HttpMetricsInterceptor } from './metrics/http.interceptor'
