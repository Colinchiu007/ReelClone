/**
 * @reelclone/common — ReelClone 共享通用库入口
 *
 * 统一导出：类型定义、错误码、异常、拦截器、过滤器、守卫、装饰器、Pipe、工具函数、配置。
 * 所有业务微服务通过 `@reelclone/common` 引入，保证基础设施代码一致。
 */

// -------------------- 类型定义 --------------------
export * from './types/api-response'
export type { VideoMetaInfo } from './types/video.types'

// -------------------- 枚举 --------------------
export * from './enums/error-code.enum'

// -------------------- 异常 --------------------
export * from './exceptions/business.exception'

// -------------------- 拦截器 --------------------
export * from './interceptors/response.interceptor'

// -------------------- 过滤器 --------------------
export * from './filters/all-exceptions.filter'

// -------------------- 认证（JWT 共享策略 + 模块） --------------------
export * from './auth'

// -------------------- 守卫 --------------------
export * from './guards/jwt-auth.guard'
export * from './guards/rate-limit.guard'
export * from './guards/roles.guard'
export * from './guards/internal-api-key.guard'

// -------------------- 装饰器 --------------------
export * from './decorators/current-user.decorator'
export * from './decorators/public.decorator'
export * from './decorators/rate-limit.decorator'
export * from './decorators/roles.decorator'
export * from './decorators/internal-api.decorator'
export * from './decorators/skip-response-interceptor.decorator'

// -------------------- Pipe --------------------
export * from './pipes/validation.pipe'

// -------------------- 工具函数 --------------------
export * from './utils/idempotency.util'
export * from './utils/tracing.util'
export * from './utils/date.util'

// -------------------- 加解密工具 --------------------
export {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  resetEncryptionKeyCache,
} from './crypto/secret-encryption'

// -------------------- 缓存服务 --------------------
export { CACHE_REDIS } from './cache/cache.constants'
export { CacheModule } from './cache/cache.module'
export { CacheService } from './cache/cache.service'

// -------------------- 配置 --------------------
export * from './config/configuration'
export * from './config/database.config'
export * from './config/redis.config'
export * from './config/jwt.config'
export * from './config/startup-profile.validator'
export * from './config/config-store.interface'

// -------------------- 服务级共享模块 --------------------
export { ServiceConfigModule } from './config/service-config.module'
export type { ServiceConfigModuleOptions } from './config/service-config.module'
export { ServiceJwtModule } from './config/service-jwt.module'
export type { ServiceJwtModuleOptions } from './config/service-jwt.module'

// -------------------- 外部资源访问安全策略（SSRF 防护） --------------------
export {
  ExternalResourcePolicyService,
  ExternalResourceModule,
} from './external-resource/external-resource.module'
export {
  ExternalResourceError,
  ExternalResourceErrorCode,
  type ExternalResourcePolicy,
  type ExternalResourcePolicyOptions,
} from './external-resource/external-resource-policy'
