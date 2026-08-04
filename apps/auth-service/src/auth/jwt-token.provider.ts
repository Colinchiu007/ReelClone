/**
 * JWT Token Provider — JWT 签发与校验
 *
 * 职责：
 *  1. 生成 access token（短期，15min）
 *  2. 生成 refresh token（长期，7d），返回 { id, token, expiresAt }
 *  3. 校验 access token 并返回 payload
 *
 * 实现依赖 jsonwebtoken 或 jose，此处为 stub（由 DI 注入真实实现）。
 */
import { Injectable } from '@nestjs/common'

export interface AccessTokenPayload {
  sub: string
  username: string
  phone: string
}

export interface RefreshTokenResult {
  id: string
  token: string
  expiresAt: Date
}

@Injectable()
export class JwtTokenProvider {
  /**
   * 签发 access token
   */
  async generateAccessToken(payload: {
    userId: string
    username: string
    phone: string
  }): Promise<string> {
    // stub — 实际实现使用 jwt.sign()
    return `access_${payload.userId}_${Date.now()}`
  }

  /**
   * 签发 refresh token，返回 id + token + expiresAt
   */
  async generateRefreshToken(payload: {
    userId: string
    username: string
    phone: string
  }): Promise<RefreshTokenResult> {
    // stub — 实际实现使用 jwt.sign() 并生成唯一 id
    const id = `rt_${payload.userId}_${Date.now()}`
    return {
      id,
      token: `refresh_${payload.userId}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }
  }

  /**
   * 校验 access token，返回 payload
   */
  async validateAccessToken(_token: string): Promise<AccessTokenPayload> {
    // stub — 实际实现使用 jwt.verify()
    return { sub: '', username: '', phone: '' }
  }
}
