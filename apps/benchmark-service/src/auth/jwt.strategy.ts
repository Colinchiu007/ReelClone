/**
 * JWT 策略
 *
 * 配合 @reelclone/common 的 JwtAuthGuard 使用。
 * 从 Authorization: Bearer <token> 中解析 JWT，将 payload 注入 request.user。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { type CurrentUserPayload, resolveJwtSecret } from '@reelclone/common';

/** JWT payload 结构 */
interface JwtPayload {
  sub: string;
  openid?: string;
  phone?: string;
  role?: string;
}

/**
 * JWT 策略实现
 * 从 Bearer Token 中提取用户信息，注入 request.user 供 @CurrentUser() 装饰器使用
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') ?? process.env.JWT_SECRET ?? resolveJwtSecret(),
      issuer: config.get<string>('jwt.issuer') ?? 'reelclone',
      audience: config.get<string>('jwt.audience') ?? 'reelclone-client',
    });
  }

  /** Passport 校验通过后调用，返回值挂到 request.user */
  validate(payload: JwtPayload): CurrentUserPayload {
    return {
      userId: payload.sub,
      openid: payload.openid,
      phone: payload.phone,
      role: payload.role,
    };
  }
}
