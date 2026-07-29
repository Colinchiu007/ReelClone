/**
 * Points Store —— 积分状态管理
 *
 * 持久化：余额信息持久化到 Taro 同步存储，
 * 冷启动后先展示上次余额，再异步刷新为最新值。
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

export interface PointsState {
  balance: number;
  frozen: number;
  total: number;
  setBalance: (b: { balance: number; frozen: number; total: number }) => void;
  consume: (amount: number) => void;
  recharge: (amount: number) => void;
}

export const usePointsStore = create<PointsState>()(
  persist(
    (set) => ({
      balance: 0,
      frozen: 0,
      total: 0,

      setBalance: (b) => set(b),

      /** 扣减积分（消费） */
      consume: (amount) =>
        set((state) => ({
          balance: Math.max(0, state.balance - amount),
          total: Math.max(0, state.total - amount),
        })),

      /** 增加积分（充值/赠送） */
      recharge: (amount) =>
        set((state) => ({
          balance: state.balance + amount,
          total: state.total + amount,
        })),
    }),
    {
      name: 'rc-points-store',
      storage: createJSONStorage(() => taroStorage),
    },
  ),
);
