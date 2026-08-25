/**
 * Taro 同步存储适配器
 *
 * 适配 Zustand persist 的 StateStorage 接口，
 * 供各 store 持久化到 Taro 同步存储（冷启动可立即恢复）。
 */
import Taro from '@tarojs/taro'

export const taroStorage = {
  getItem: (name: string): string | null => Taro.getStorageSync(name) || null,
  setItem: (name: string, value: string): void => {
    Taro.setStorageSync(name, value)
  },
  removeItem: (name: string): void => {
    Taro.removeStorageSync(name)
  },
}
