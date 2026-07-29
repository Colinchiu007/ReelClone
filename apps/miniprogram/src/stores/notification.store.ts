/**
 * Notification Store —— 通知未读数状态管理
 *
 * 用于在 TabBar / 页面头部展示未读角标。
 * 持久化到 Taro 同步存储，冷启动后可立即显示上次未读数。
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Taro from '@tarojs/taro';

/** Taro 同步存储适配器 */
const taroStorage = {
  getItem: (name: string): string | null => Taro.getStorageSync(name) || null,
  setItem: (name: string, value: string): void => {
    Taro.setStorageSync(name, value);
  },
  removeItem: (name: string): void => {
    Taro.removeStorageSync(name);
  },
};

export interface NotificationState {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  increment: () => void;
  decrement: () => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      unreadCount: 0,

      setUnreadCount: (n) => set({ unreadCount: Math.max(0, n) }),

      increment: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

      decrement: () =>
        set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) })),
    }),
    {
      name: 'rc-notification-store',
      storage: createJSONStorage(() => taroStorage),
    },
  ),
);
