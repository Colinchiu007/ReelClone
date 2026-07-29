/**
 * JWT 策略
 *
 * 配合 Passport + JwtAuthGuard 使用，解析 Bearer Token 并注入 request.user。
 * payload 结构对齐 CurrentUserPayload：{ userId, openid, phone, role }
 */
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus, DATABASE_CONNECTIONS } from '@reelclone/database';
import { CurrentUserPayload, ErrorCode, BusinessException, resolveJwtSecret } from '@reelclone/common';

interface JwtPayload {
  userId: string;
  openid?: string;
  phone?: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      issuer: process.env.JWT_ISSUER || 'reelclone',
      audience: process.env.JWT_AUDIENCE || 'reelclone-client',
    });
  }

  /**
   * Passport 验证回调：payload 解析后调用，返回值注入 request.user
   */
  async validate(payload: JwtPayload): Promise<CurrentUserPayload> {
    if (!payload.userId) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        'Token 无效，缺少用户标识',
        undefined,
        401,
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.userId },
      select: ['id', 'openId', 'mobile', 'status'],
    });

    if (!user) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '用户不存在', undefined, 401);
    }

    if (user.status === UserStatus.FROZEN) {
      throw new BusinessException(ErrorCode.FORBIDDEN, '账号已被冻结', undefined, 403);
    }

    if (user.status === UserStatus.DELETED) {
      throw new BusinessException(ErrorCode.UNAUTHORIZED, '账号已注销', undefined, 401);
    }

    return {
      userId: user.id,
      openid: user.openId,
      phone: user.mobile ?? undefined,
    };
  }
}
