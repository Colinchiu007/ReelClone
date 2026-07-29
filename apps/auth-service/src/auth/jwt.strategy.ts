/**
 * Passport JWT 策略
 *
 * 配合 @reelclone/common 的 JwtAuthGuard 使用：
 *  - 守卫调用 super.canActivate() → 触发 Passport JWT 流程
 *  - Passport 从 Authorization: Bearer <token> 提取 token
 *  - 校验签名 + 过期时间（ignoreExpiration: false）
 *  - 调用 validate(payload) 检查 Redis 黑名单
 *  - 返回值注入 request.user，供 @CurrentUser() 装饰器使用
 */
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Redis } from 'ioredis'
import {
  BusinessException,
  ErrorCode,
  CurrentUserPayload,
  jwtConfig,
  resolveJwtSecret,
  type JwtConfig,
} from '@reelclone/common'
import { REDIS_CLIENT } from '@reelclone/database'
import type { JwtPayload } from './jwt.service'

/** Redis 中存放 jti 黑名单的 key 前缀（与 AuthService.logout 一致） */
export const BLACKLIST_KEY_PREFIX = 'auth:blacklist:'

/** Redis 中存放"改密后踢下线"标记的 key 前缀（与 UserService.changePassword 一致） */
export const PASSWORD_CHANGED_KEY_PREFIX = 'user:password-changed:'

/**
 * 构造黑名单 Redis key
 * 注意：RedisModule 配置了 keyPrefix（默认 'reelclone:'），所以这里不再重复加前缀
 */
export function buildBlacklistKey(jti: string): string {
  return `${BLACKLIST_KEY_PREFIX}${jti}`
}

/** 构造"改密踢下线"Redis key */
export function buildPasswordChangedKey(userId: string): string {
  return `${PASSWORD_CHANGED_KEY_PREFIX}${userId}`
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const cfg = configService.get<JwtConfig>(jwtConfig.KEY)
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // jwtConfig 加载后 cfg.secret 必有；兜底走 resolveJwtSecret 以保证生产环境硬失败
      secretOrKey: cfg?.secret ?? resolveJwtSecret(),
      issuer: cfg?.issuer,
      audience: cfg?.audience,
    })
  }

  /**
   * Passport JWT 策略校验回调
   * 此时签名 & 过期时间已通过，只需检查黑名单
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    // 检查 jti 是否在黑名单
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(buildBlacklistKey(payload.jti))
      if (isBlacklisted) {
        throw new BusinessException(ErrorCode.UNAUTHORIZED, '登录已失效，请重新登录', undefined)
      }
    }

    // 检查"改密踢下线"标记：用户修改密码后，旧 Token 立即失效
    if (payload.sub) {
      const passwordChanged = await this.redis.exists(buildPasswordChangedKey(payload.sub))
      if (passwordChanged) {
        throw new BusinessException(ErrorCode.UNAUTHORIZED, '密码已修改，请重新登录', undefined)
      }
    }

    // 注入到 request.user，供 @CurrentUser() 使用
    return {
      userId: payload.sub,
      openid: payload.openId,
      jti: payload.jti,
      exp: payload.exp,
    } as CurrentUserPayload
  }
}
