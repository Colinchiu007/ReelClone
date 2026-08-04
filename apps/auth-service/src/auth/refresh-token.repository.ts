/**
 * Refresh Token Repository — 刷新令牌持久化
 *
 * 职责：
 *  1. 创建 refresh token 记录（含 familyId 用于令牌族追踪）
 *  2. 按 refreshToken 查找令牌族（findFamily）
 *  3. 标记已使用（markAsUsed）— 用于重用检测
 *  4. 吊销整个令牌族（revokeFamily）— 发现重用时安全降级
 *  5. 清理过期令牌（cleanupExpired）
 *
 * 数据库表：refresh_tokens（PostgreSQL / SQLite）
 */
import { Injectable } from '@nestjs/common'

export interface RefreshTokenRecord {
  id: string
  userId: string
  familyId: string
  refreshTokenId: string
  token: string
  isUsed: boolean
  expiresAt: Date
}

export interface TokenFamilyResult {
  familyId: string
  family: Array<{ id: string; isUsed: boolean }>
}

@Injectable()
export class RefreshTokenRepository {
  /**
   * 创建 refresh token 记录
   */
  async create(data: {
    userId: string
    familyId: string
    refreshTokenId: string
    token: string
    isUsed: boolean
    expiresAt: Date
  }): Promise<RefreshTokenRecord> {
    // stub — 实际实现使用 TypeORM repository.save()
    return {
      id: `rt_${Date.now()}`,
      ...data,
    }
  }

  /**
   * 按 refreshToken 值查找令牌族
   */
  async findFamily(
    _refreshToken: string,
  ): Promise<
    Array<{
      id: string
      refreshTokenId: string
      isUsed: boolean
      expiresAt?: Date
    }>
  > {
    // stub — 实际实现使用 TypeORM repository.find()
    return []
  }

  /**
   * 更新 refreshTokenId（令牌轮转时）
   */
  async updateRefreshTokenId(
    _tokenRecordId: string,
    _newRefreshTokenId: string,
  ): Promise<void> {
    // stub — 实际实现使用 TypeORM repository.update()
  }

  /**
   * 标记令牌已使用（用于重用检测）
   */
  async markAsUsed(_tokenRecordId: string): Promise<void> {
    // stub — 实际实现使用 TypeORM repository.update()
  }

  /**
   * 查找整个令牌族（用于重用检测后吊销）
   */
  async findTokenFamily(familyId: string): Promise<TokenFamilyResult> {
    // stub — 实际实现使用 TypeORM repository.find()
    return { familyId, family: [] }
  }

  /**
   * 吊销整个令牌族（发现重用时）
   */
  async revokeFamily(_familyId: string): Promise<void> {
    // stub — 实际实现使用 TypeORM repository.delete()
  }

  /**
   * 清理过期令牌
   */
  async cleanupExpired(): Promise<{ deleted: number }> {
    // stub — 实际实现使用 TypeORM repository.delete()
    return { deleted: 0 }
  }
}
