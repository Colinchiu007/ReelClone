/**
 * 共享 Access Token JWT 策略
 *
 * 所有微服务应使用此策略替代各自的 jwt.strategy.ts。
 * 安全校验清单：
 *  1. 签名 + 过期时间（Passport 内置）
 *  2. Token 类型 = access（拒绝 refresh Bearer）
 *  3. jti 黑名单（logout 吊销）
 *  4. 密码修改标记（改密踢下线）
 *  5. Token Version 校验（凭证变更撤权）
 *  6. Session Family 存在性（刷新轮换）
 */
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { Redis } from 'ioredis'
import { resolveJwtSecret } from '../config/jwt.config'
import type { JwtPayload } from './jwt-payload.interface'
import {
  buildBlacklistKey,
  buildPasswordChangedKey,
  buildTokenVersionKey,
  buildSessionFamilyKey,
} from './redis-keys.util'

/** 当前请求的用户信息（注入到 request.user） */
export interface AuthenticatedUser {
  userId: string
  openid?: string
  phone?: string
  jti?: string
  exp?: number
  role?: string
}

/**
 * Strategy 配置选项
 */
export interface AccessTokenStrategyOptions {
  /** Redis 客户端实例 */
  redis: Redis
  /** JWT secret（可选，默认从 resolveJwtSecret() 获取） */
  secretOrKey?: string
  /** 是否检查 tokenVersion（默认 true） */
  checkTokenVersion?: boolean
  /** 是否检查 session family（默认 true，仅 access token 需要） */
  checkSessionFamily?: boolean
}

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly redis: Redis
  private readonly checkTokenVersion: boolean
  private readonly checkSessionFamily: boolean

  constructor(options: AccessTokenStrategyOptions) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: options.secretOrKey ?? resolveJwtSecret(),
    })
    this.redis = options.redis
    this.checkTokenVersion = options.checkTokenVersion ?? true
    this.checkSessionFamily = options.checkSessionFamily ?? true
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // 1. Token 类型校验：只接受 access token
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Token 类型无效，请使用 Access Token')
    }

    // 2. jti 黑名单检查（logout 后吊销）
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(buildBlacklistKey(payload.jti))
      if (isBlacklisted) {
        throw new UnauthorizedException('登录已失效，请重新登录')
      }
    }

    // 3. 密码修改标记检查
    if (payload.sub) {
      const passwordChanged = await this.redis.exists(buildPasswordChangedKey(payload.sub))
      if (passwordChanged) {
        throw new UnauthorizedException('密码已修改，请重新登录')
      }
    }

    // 4. Token Version 校验（凭证变更撤权）
    if (this.checkTokenVersion && payload.sub && payload.tokenVersion !== undefined) {
      const cachedVersion = await this.redis.get(buildTokenVersionKey(payload.sub))
      if (cachedVersion !== null) {
        const serverVersion = parseInt(cachedVersion, 10)
        if (Number.isFinite(serverVersion) && payload.tokenVersion < serverVersion) {
          throw new UnauthorizedException('凭证已变更，请重新登录')
        }
      }
    }

    // 5. Session Family 存在性检查
    if (this.checkSessionFamily && payload.familyId) {
      const familyExists = await this.redis.exists(buildSessionFamilyKey(payload.familyId))
      if (!familyExists) {
        throw new UnauthorizedException('会话已失效，请重新登录')
      }
    }

    return {
      userId: payload.sub,
      openid: payload.openId,
      jti: payload.jti,
      exp: payload.exp,
      role: payload.role,
    }
  }
}
