/**
 * @reelclone/common — ReelClone 共享通用库入口
 *
 * 统一导出：类型定义、错误码、异常、拦截器、过滤器、守卫、装饰器、Pipe、工具函数、配置。
 * 所有业务微服务通过 `@reelclone/common` 引入，保证基础设施代码一致。
 */

// -------------------- 类型定义 --------------------
export * from './types/api-response'

// -------------------- 枚举 --------------------
export * from './enums/error-code.enum'

// -------------------- 异常 --------------------
export * from './exceptions/business.exception'

// -------------------- 拦截器 --------------------
export * from './interceptors/response.interceptor'

// -------------------- 过滤器 --------------------
export * from './filters/all-exceptions.filter'

// -------------------- 守卫 --------------------
export * from './guards/jwt-auth.guard'
export * from './guards/rate-limit.guard'

// -------------------- 装饰器 --------------------
export * from './decorators/current-user.decorator'
export * from './decorators/public.decorator'
export * from './decorators/rate-limit.decorator'

// -------------------- Pipe --------------------
export * from './pipes/validation.pipe'

// -------------------- 工具函数 --------------------
export * from './utils/idempotency.util'
export * from './utils/tracing.util'
export * from './utils/date.util'

// -------------------- 配置 --------------------
export * from './config/configuration'
export * from './config/database.config'
export * from './config/redis.config'
export * from './config/jwt.config'
