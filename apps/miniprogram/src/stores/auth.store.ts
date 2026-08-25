/**
 * Auth Store —— 认证状态管理
 *
 * 持久化：使用 Zustand persist 中间件 + Taro 同步存储适配器，
 * 小程序冷启动后可恢复用户信息，避免白屏闪烁。
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '@/types'
import { taroStorage } from './storage'

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'rc-auth-store',
      storage: createJSONStorage(() => taroStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
