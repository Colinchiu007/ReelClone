/**
 * JWT 策略
 *
 * 配合 @reelclone/common 的 JwtAuthGuard 使用。
 * 从 Authorization: Bearer <token> 中解析 JWT，将 payload 注入 request.user。
 *
 * 微服务场景：order-service 不签发 token，仅校验由网关/用户服务签发的 token。
 */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CurrentUserPayload, resolveJwtSecret } from '@reelclone/common';

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
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
    });
  }

  /**
   * 校验通过后将 payload 映射为 CurrentUserPayload 注入 request.user
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    return {
      userId: payload.sub,
      openid: payload.openid,
      phone: payload.phone,
      role: payload.role,
    };
  }
}
