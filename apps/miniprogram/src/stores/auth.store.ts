/**
 * Auth Store —— 认证状态管理
 *
 * 持久化：使用 Zustand persist 中间件 + Taro 同步存储适配器，
 * 小程序冷启动后可恢复用户信息，避免白屏闪烁。
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Taro from '@tarojs/taro';
import type { User } from '@/types';

/** Taro 同步存储适配器（适配 Zustand persist 的 StateStorage 接口） */
const taroStorage = {
  getItem: (name: string): string | null => Taro.getStorageSync(name) || null,
  setItem: (name: string, value: string): void => {
    Taro.setStorageSync(name, value);
  },
  removeItem: (name: string): void => {
    Taro.removeStorageSync(name);
  },
};

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  logout: () => void;
  updatePoints: (points: number) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: true }),

      logout: () => set({ user: null, isAuthenticated: false }),

      /** 更新用户积分（支付/消费后同步） */
      updatePoints: (points) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, currentPoints: points }
            : null,
        })),
    }),
    {
      name: 'rc-auth-store',
      storage: createJSONStorage(() => taroStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
