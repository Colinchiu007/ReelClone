/**
 * 基于 Redis 的限流守卫（令牌桶算法）
 *
 * 配合 @RateLimit(limit, window) 装饰器使用，对接口进行速率限制。
 * 令牌桶原理：
 *  - 桶容量 = limit，按 limit/window 的速率补充令牌
 *  - 每次请求消耗 1 个令牌，令牌不足时拒绝请求
 *  - 使用 Redis Lua 脚本保证「读取-计算-写入」的原子性
 *
 * 使用前需在应用中通过 DI 提供 Redis 客户端：
 * ```ts
 * { provide: REDIS_CLIENT, useFactory: () => new Redis(...) }
 * ```
 */
import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type Redis from 'ioredis'
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator'
import { BusinessException } from '../exceptions/business.exception'
import { ErrorCode } from '../enums/error-code.enum'

/** Redis 客户端注入 token */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT')

/** 限流 key 前缀 */
const RATE_LIMIT_PREFIX = 'rl'

/**
 * 令牌桶 Lua 脚本（原子操作）
 *
 * KEYS[1] = 令牌桶 Redis key
 * ARGV[1] = 桶容量（capacity）
 * ARGV[2] = 令牌补充速率（tokens/秒）
 * ARGV[3] = 当前时间戳（毫秒）
 * ARGV[4] = key 过期时间（秒）
 *
 * 返回 1 表示放行，0 表示限流
 */
const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens = tonumber(bucket[1])
local lastRefill = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  lastRefill = now
end

-- 按经过时间补充令牌
local elapsed = math.max(0, now - lastRefill)
tokens = math.min(capacity, tokens + elapsed * refillRate / 1000.0)

if tokens >= 1 then
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
  redis.call('EXPIRE', key, ttl)
  return 1
else
  redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
  redis.call('EXPIRE', key, ttl)
  return 0
end
`

/** 请求对象的最小结构 */
interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>
  user?: { userId?: string }
  ip?: string
  socket?: { remoteAddress?: string }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name)

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 读取 @RateLimit() 装饰器配置
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // 未配置限流规则，直接放行
    if (!options) {
      return true
    }

    // Redis 未注入时降级放行（开发环境），并记录警告
    if (!this.redis) {
      this.logger.warn('Redis 客户端未注入，限流守卫降级放行，请确认生产环境已正确配置 REDIS_CLIENT')
      return true
    }

    const request = context.switchToHttp().getRequest<MinimalRequest>()
    const identifier = this.resolveIdentifier(request)
    const key = `${RATE_LIMIT_PREFIX}:${identifier}:${context.getClass().name}:${context.getHandler().name}`

    // 令牌补充速率：limit 个令牌 / window 秒
    const refillRate = options.limit / options.window
    const now = Date.now()
    // key 过期时间设为窗口的 2 倍，避免残留
    const ttl = Math.ceil(options.window * 2)

    const allowed = await this.redis.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      key,
      options.limit,
      refillRate,
      now,
      ttl,
    )

    if (allowed === 1) {
      return true
    }

    // 被限流，抛出业务异常
    throw new BusinessException(
      ErrorCode.RATE_LIMITED,
      '请求过于频繁，请稍后重试',
      { limit: options.limit, window: options.window, retryAfter: options.window },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }

  /**
   * 解析限流标识：已登录用户用 userId，未登录用 IP
   */
  private resolveIdentifier(request: MinimalRequest): string {
    if (request.user?.userId) {
      return `user:${request.user.userId}`
    }
    // 兼容 Express 的 ip 与 socket.remoteAddress
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown'
    return `ip:${ip}`
  }
}
