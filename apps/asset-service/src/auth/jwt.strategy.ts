/**
 * JWT Passport 策略
 *
 * 配合 libs/common 中的 JwtAuthGuard（extends AuthGuard('jwt')）使用。
 * 解析 Authorization: Bearer <token> 头，验证签名后将 payload 注入 request.user。
 *
 * asset-service 只读 token、不反查数据库，用户身份信任网关签发的 JWT，
 * 资产所有权在 Service 层通过 userId 匹配再次校验。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload, resolveJwtSecret } from '@reelclone/common';

/** JWT payload 子集（仅声明本服务依赖的字段） */
interface JwtPayload {
  sub: string;
  userId?: string;
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
      secretOrKey:
        config.get<string>('jwt.secret') ??
        config.get<string>('JWT_SECRET') ??
        resolveJwtSecret(),
      issuer: config.get<string>('jwt.issuer') ?? 'reelclone',
      audience: config.get<string>('jwt.audience') ?? 'reelclone-client',
    });
  }

  /**
   * Passport 校验通过后调用，返回值注入 request.user。
   * 兼容 sub / userId 两种写法。
   */
  validate(payload: JwtPayload): CurrentUserPayload {
    const userId = payload.userId ?? payload.sub;
    return {
      userId,
      openid: payload.openid,
      phone: payload.phone,
      role: payload.role,
    };
  }
}
