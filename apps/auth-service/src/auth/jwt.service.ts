/**
 * JWT 自定义服务
 *
 * 在 @nestjs/jwt 的 JwtService 之上封装：
 *  - 签发 AccessToken（1h，载荷：sub/openId/jti）
 *  - 签发 RefreshToken（7d，载荷：sub/openId/jti/type=refresh）
 *  - verify / decode 工具方法
 *
 * 每个 Token 都带 jti（uuid v4），用于 logout 时加入 Redis 黑名单。
 */
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { v4 as uuidv4 } from 'uuid'
import type { StringValue } from 'ms'
import type { JwtConfig } from '@reelclone/common'
import { jwtConfig } from '@reelclone/common'

/** JWT Payload 结构 */
export interface JwtPayload {
  /** 用户 ID（subject） */
  sub: string
  /** 微信 OpenID */
  openId: string
  /** Token 唯一 ID（用于黑名单） */
  jti: string
  /** Token 类型：access | refresh */
  type?: 'access' | 'refresh'
  /** 用户角色（USER/ADMIN/SUPER_ADMIN），供 RolesGuard 校验 */
  role?: string
  /** Token 版本号（密码修改/冻结/注销时递增） */
  tokenVersion?: number
  /** Session Family ID（登录时生成，刷新时轮换） */
  familyId?: string
  /** 签发时间（秒） */
  iat?: number
  /** 过期时间（秒） */
  exp?: number
}

/** Token 对 */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class JwtCustomService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 签发 Access Token
   * 默认 1h 过期（由 JWT_EXPIRES_IN 控制）
   */
  signAccessToken(
    userId: string,
    openId: string,
    role: string,
    tokenVersion: number,
    familyId: string,
  ): string {
    const payload: JwtPayload = {
      sub: userId,
      openId,
      jti: uuidv4(),
      type: 'access',
      role,
      tokenVersion,
      familyId,
    }
    return this.jwtService.sign(payload)
  }

  /**
   * 签发 Refresh Token
   * 默认 7d 过期（由 JWT_REFRESH_EXPIRES_IN 控制）
   */
  signRefreshToken(
    userId: string,
    openId: string,
    role: string,
    tokenVersion: number,
    familyId: string,
  ): string {
    const cfg = this.configService.get<JwtConfig>(jwtConfig.KEY)
    const refreshExpiresIn = cfg?.refreshExpiresIn ?? '7d'
    const payload: JwtPayload = {
      sub: userId,
      openId,
      jti: uuidv4(),
      type: 'refresh',
      role,
      tokenVersion,
      familyId,
    }
    return this.jwtService.sign(payload, {
      expiresIn: refreshExpiresIn as StringValue,
    })
  }

  /** 同时签发 Access + Refresh Token */
  signTokenPair(
    userId: string,
    openId: string,
    role: string,
    tokenVersion: number,
    familyId: string,
  ): TokenPair {
    return {
      accessToken: this.signAccessToken(userId, openId, role, tokenVersion, familyId),
      refreshToken: this.signRefreshToken(userId, openId, role, tokenVersion, familyId),
    }
  }

  /**
   * 校验 Token 签名 & 过期时间
   * 失败会抛错（由调用方捕获并转为 BusinessException）
   */
  verify(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token)
  }

  /**
   * 仅解码 Token（不校验签名），用于 logout 取 jti/exp
   */
  decode(token: string): JwtPayload | null {
    const decoded = this.jwtService.decode(token)
    if (decoded && typeof decoded === 'object') {
      return decoded as JwtPayload
    }
    return null
  }
}
