/**
 * JWT Passport 策略
 *
 * 配合 libs/common 中的 JwtAuthGuard（extends AuthGuard('jwt')）使用。
 * 解析 Authorization: Bearer <token> 头，验证签名后将 payload 注入 request.user。
 *
 * payload 结构由签发端决定，至少包含 userId。本服务只读不写。
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import type { CurrentUserPayload } from '@reelclone/common'
import { resolveJwtSecret } from '@reelclone/common'

/** JWT payload 子集（仅声明本服务依赖的字段） */
export interface JwtPayload {
  sub: string
  userId?: string
  openid?: string
  phone?: string
  role?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      // 从 Authorization: Bearer <token> 提取
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // 不忽略过期时间
      ignoreExpiration: false,
      // 优先从 jwt 命名空间读取，未配置时通过 resolveJwtSecret 兜底（生产环境严格校验）
      secretOrKey: config.get<string>('jwt.secret')
        ?? config.get<string>('JWT_SECRET')
        ?? resolveJwtSecret(),
      // 通过 issuer / audience 进一步校验（如果配置了）
      issuer: config.get<string>('jwt.issuer') ?? config.get<string>('JWT_ISSUER') ?? 'reelclone',
      audience: config.get<string>('jwt.audience') ?? config.get<string>('JWT_AUDIENCE') ?? 'reelclone-client',
    })
  }

  /**
   * Passport 校验通过后会调用 validate，返回值会注入 request.user
   * 兼容 sub / userId 两种写法
   */
  validate(payload: JwtPayload): CurrentUserPayload {
    const userId = payload.userId ?? payload.sub
    return {
      userId,
      openid: payload.openid,
      phone: payload.phone,
      role: payload.role,
    }
  }
}
