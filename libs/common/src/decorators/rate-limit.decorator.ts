/**
 * @RateLimit() 方法装饰器
 *
 * 配合 RateLimitGuard 使用，声明接口的限流策略。
 * 采用令牌桶算法：在指定时间窗口内最多允许 limit 次请求。
 *
 * @example
 * ```ts
 * @RateLimit(10, 60)  // 60 秒内最多 10 次请求
 * @Post('generate')
 * generate() { ... }
 * ```
 */
import { SetMetadata } from '@nestjs/common'

/** 限流配置的 metadata key */
export const RATE_LIMIT_KEY = 'rateLimit'

/**
 * 限流配置
 */
export interface RateLimitOptions {
  /** 时间窗口内允许的最大请求数（令牌桶容量） */
  limit: number
  /** 时间窗口（秒），令牌桶按此速率补充 */
  window: number
}

/**
 * 设置接口限流策略
 *
 * @param limit 时间窗口内允许的最大请求数
 * @param window 时间窗口（秒）
 */
export const RateLimit = (limit: number, window: number): MethodDecorator =>
  SetMetadata(RATE_LIMIT_KEY, { limit, window } satisfies RateLimitOptions)
