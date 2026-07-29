import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { type CurrentUserPayload, resolveJwtSecret } from '@reelclone/common';

/**
 * JWT 策略
 *
 * 从 Authorization: Bearer <token> 中解析 JWT，
 * 校验签名后将 payload 注入 request.user（CurrentUserPayload）。
 *
 * 微服务场景：workbench-service 不签发 token，仅校验由网关/用户服务签发的 token。
 */
interface JwtPayload {
  sub: string;
  openid?: string;
  phone?: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: (config.get<string>('jwt.secret') ??
        process.env.JWT_SECRET ??
        resolveJwtSecret()) as string,
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
