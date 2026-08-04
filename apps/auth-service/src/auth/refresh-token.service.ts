/**
 * Refresh Token Service — 令牌轮转与吊销
 *
 * 职责：
 *  1. 轮转 refresh token（旧 token → 新 token，含重用检测）
 *  2. 吊销令牌族（发现重用时安全降级）
 *  3. 清理过期令牌（定时任务）
 *
 * 重用检测流程：
 *  - 查找当前 refresh token → 若 isUsed=true → 令牌族被重用 → 吊销整个族
 *  - 否则：标记旧 token 为已使用 → 签发新 token → 持久化
 *
 * 与 TokenService 的分工：
 *  - TokenService：首次签发（登录/注册）
 *  - RefreshTokenService：令牌轮转（refresh）
 */
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { RefreshTokenRepository } from './refresh-token.repository'
import { JwtTokenProvider } from './jwt-token.provider'

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly jwtTokenProvider: JwtTokenProvider,
  ) {}

  /**
   * 轮转 refresh token
   *
   * 流程：
   *  1. 按 refreshToken 查找令牌族
   *  2. 检查是否过期
   *  3. 检测重用（isUsed=true → 吊销整个族）
   *  4. 标记旧 token 为已使用
   *  5. 签发新 token 并持久化
   */
  async rotateRefreshToken(
    refreshToken: string,
    _accessToken: string,
  ): Promise<{ newRefreshToken: string }> {
    const family = await this.refreshTokenRepository.findFamily(refreshToken)

    if (family.length === 0) {
      throw new UnauthorizedException('Refresh token not found')
    }

    const currentToken = family[0]

    // 检查过期
    if (currentToken.expiresAt && currentToken.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired')
    }

    // 重用检测：如果 token 已被使用过，说明令牌被重用
    if (currentToken.isUsed) {
      // 吊销整个令牌族
      await this.refreshTokenRepository.revokeFamily(currentToken.refreshTokenId)
      throw new UnauthorizedException('Refresh token reuse detected')
    }

    // 标记旧 token 为已使用
    await this.refreshTokenRepository.markAsUsed(currentToken.id)

    // 签发新 refresh token（沿用同一 familyId）
    const newRefreshTokenResult = await this.jwtTokenProvider.generateRefreshToken({
      userId: '', // 实际从 token payload 获取
      username: '',
      phone: '',
    })

    // 持久化新 token
    await this.refreshTokenRepository.create({
      userId: '',
      familyId: currentToken.refreshTokenId,
      refreshTokenId: newRefreshTokenResult.id,
      token: newRefreshTokenResult.token,
      isUsed: false,
      expiresAt: newRefreshTokenResult.expiresAt,
    })

    return { newRefreshToken: newRefreshTokenResult.token }
  }

  /**
   * 吊销整个令牌族
   */
  async revokeTokenFamily(familyId: string): Promise<void> {
    await this.refreshTokenRepository.revokeFamily(familyId)
  }

  /**
   * 清理过期令牌（定时任务调用）
   */
  async cleanupExpiredTokens(): Promise<{ deleted: number }> {
    return this.refreshTokenRepository.cleanupExpired()
  }
}
