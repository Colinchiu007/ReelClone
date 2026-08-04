/**
 * Token Service — 令牌对生成
 *
 * 职责：
 *  1. 协调 JwtTokenProvider 签发 access + refresh token
 *  2. 将 refresh token 持久化到 RefreshTokenRepository
 *  3. 返回 token pair 给调用方
 *
 * 与 RefreshTokenService 的分工：
 *  - TokenService：首次签发（登录/注册）
 *  - RefreshTokenService：令牌轮转（refresh）
 */
import { Injectable } from '@nestjs/common'
import { JwtTokenProvider } from './jwt-token.provider'
import { RefreshTokenRepository } from './refresh-token.repository'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtTokenProvider: JwtTokenProvider,
    private readonly refreshTokenRepository: RefreshTokenRepository,
  ) {}

  /**
   * 生成 token pair（登录/注册时调用）
   */
  async generateTokenPair(input: {
    userId: string
    username: string
    phone: string
  }): Promise<TokenPair> {
    const [accessToken, refreshTokenResult] = await Promise.all([
      this.jwtTokenProvider.generateAccessToken(input),
      this.jwtTokenProvider.generateRefreshToken(input),
    ])

    // 持久化 refresh token（使用 refreshTokenResult.id 作为 familyId 的初始值）
    await this.refreshTokenRepository.create({
      userId: input.userId,
      familyId: refreshTokenResult.id,
      refreshTokenId: refreshTokenResult.id,
      token: refreshTokenResult.token,
      isUsed: false,
      expiresAt: refreshTokenResult.expiresAt,
    })

    return {
      accessToken,
      refreshToken: refreshTokenResult.token,
    }
  }
}
