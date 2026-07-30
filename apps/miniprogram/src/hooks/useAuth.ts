/**
 * useAuth —— 认证 Hook
 *
 * 返回：
 *  - user            当前用户信息（来自 auth store）
 *  - isAuthenticated 是否已登录
 *  - loading         登录请求中
 *  - login           微信登录（Taro.login → wechatLogin API → 存储 Token + 用户）
 *  - logout          登出（调用 API + 清空本地状态）
 *  - refreshUser     从服务端刷新用户信息
 */
import { useState, useCallback } from 'react'
import Taro from '@tarojs/taro'
import { wechatLogin, logout as logoutApi } from '@/services/api/auth.api'
import { getCurrentUser } from '@/services/api/user.api'
import { tokenStore } from '@/services/token'
import { useAuthStore } from '@/stores/auth.store'
import type { User } from '@/types'
import type { WxLoginResult } from '@/types/generated/api-types'

export function useAuth() {
  const { user, isAuthenticated, setUser, logout: clearAuthState } = useAuthStore()
  const [loading, setLoading] = useState(false)

  /** 微信登录：Taro.login 获取 code → 调用后端 → 存储 Token + 用户 */
  const login = useCallback(
    async (nickname?: string, avatarUrl?: string): Promise<WxLoginResult> => {
      setLoading(true)
      try {
        const { code } = await Taro.login()
        const result = await wechatLogin(code, nickname, avatarUrl)
        tokenStore.setTokens(result.accessToken, result.refreshToken)
        // AuthUserResponse 与 User 字段不完全一致（User 多 email/industryPreferences/createdAt），
        // 待 user-service 接入 OpenAPI 后统一为生成类型，届时可移除此映射。
        const userForStore: User = {
          id: result.user.id,
          openId: result.user.openId,
          nickname: result.user.nickname,
          avatarUrl: result.user.avatarUrl,
          mobile: result.user.mobile,
          email: null,
          currentPoints: result.user.currentPoints,
          totalPoints: result.user.totalPoints,
          industryPreferences: [],
          status: result.user.status,
          createdAt: new Date().toISOString(),
        }
        setUser(userForStore)
        return result
      } finally {
        setLoading(false)
      }
    },
    [setUser],
  )

  /** 登出：调用后端登出 API + 清空本地 Token 与状态 */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutApi()
    } catch {
      // 即使 API 调用失败也继续清空本地状态
    } finally {
      tokenStore.clear()
      clearAuthState()
    }
  }, [clearAuthState])

  /** 从服务端刷新用户信息并更新 store */
  const refreshUser = useCallback(async () => {
    const fresh = await getCurrentUser()
    setUser(fresh)
    return fresh
  }, [setUser])

  return { user, isAuthenticated, loading, login, logout, refreshUser }
}
