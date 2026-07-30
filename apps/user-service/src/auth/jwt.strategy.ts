/**
 * JWT 策略
 *
 * 配合 Passport + JwtAuthGuard 使用，解析 Bearer Token 并注入 request.user。
 * payload 结构对齐 CurrentUserPayload：{ sub, openId, jti, role }
 *
 * 与 auth-service 的 JwtStrategy 对齐：
 *  - 检查 Redis jti 黑名单（logout 跨服务生效）
 *  - 检查"改密踢下线"标记
 */
import { Inject, Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Redis } from 'ioredis'
import { User, UserStatus, DATABASE_CONNECTIONS, REDIS_CLIENT } from '@reelclone/database'
import {
  CurrentUserPayload,
  ErrorCode,
  BusinessException,
  resolveJwtSecret,
} from '@reelclone/common'

interface JwtPayload {
  sub: string
  openId?: string
  jti?: string
  phone?: string
  role?: string
  exp?: number
}

/** Redis key 前缀（与 auth-service 保持一致） */
const BLACKLIST_KEY_PREFIX = 'auth:blacklist:'
const PASSWORD_CHANGED_KEY_PREFIX = 'user:password-changed:'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepository: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      issuer: process.env.JWT_ISSUER || 'reelclone',
      audience: process.env.JWT_AUDIENCE || 'reelclone-client',
    })
  }

  /**
   * Passport 验证回调：payload 解析后调用，返回值注入 request.user
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    if (!payload.sub) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        'Token 无效，缺少用户标识',
        undefined,
        401,
      )
    }

    // 检查 jti 黑名单（logout 后 token 跨服务失效）
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(`${BLACKLIST_KEY_PREFIX}${payload.jti}`)
      if (isBlacklisted) {
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          '登录已失效，请重新登录',
          undefined,
          401,
        )
      }
    }

    // 检查"改密踢下线"标记
    const passwordChanged = await this.redis.exists(`${PASSWORD_CHANGED_KEY_PREFIX}${payload.sub}`)
    if (passwordChanged) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '密码已修改，请重新登录', undefined, 401)
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'openId', 'mobile', 'status'],
    })

    if (!user) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在', undefined, 401)
    }

    if (user.status === UserStatus.FROZEN) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '账号已被冻结', undefined, 403)
    }

    if (user.status === UserStatus.DELETED) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号已注销', undefined, 401)
    }

    return {
      userId: user.id,
      openid: user.openId,
      phone: user.mobile ?? undefined,
      jti: payload.jti,
      exp: payload.exp,
      role: payload.role,
    } as CurrentUserPayload
  }
}
