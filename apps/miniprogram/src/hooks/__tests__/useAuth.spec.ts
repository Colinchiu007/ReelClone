/**
 * @jest-environment jsdom
 *
 * useAuth Hook 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（user=null, isAuthenticated=false, loading=false）
 *  - login 正常路径：Taro.login → wechatLogin → setTokens → setUser
 *  - login 异常路径：Taro.login 抛错 / wechatLogin 抛错
 *  - login finally：成功或失败 loading 都复位
 *  - logout 正常路径：logoutApi → tokenStore.clear → clearAuthState
 *  - logout 异常路径：logoutApi 抛错仍清空本地状态
 *  - refreshUser：getCurrentUser → setUser
 */
import Taro from '@tarojs/taro'
import { __resetAll } from '../../../__mocks__/taro'
import { renderHook, act } from '../../test/renderHook'
import { useAuth } from '../useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { tokenStore } from '@/services/token'
import type { WxLoginResult, AuthUserResponse } from '@/types/generated/api-types'

/** 构造 wechatLogin 返回结果 */
function buildWxLoginResult(overrides: Partial<WxLoginResult> = {}): WxLoginResult {
  const user: AuthUserResponse = {
    id: 'user-001',
    openId: 'wx-open-id',
    unionId: null,
    nickname: '测试用户',
    avatarUrl: 'https://example.com/avatar.png',
    mobile: '13800138000',
    status: 'ACTIVE',
    currentPoints: 100,
    totalPoints: 100,
    ...overrides.user,
  }
  return {
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    user,
    isNewUser: false,
    ...overrides,
  }
}

/** mock Taro.login 返回 code */
function mockTaroLogin(code = 'wx-code-001') {
  ;(Taro.login as jest.Mock).mockResolvedValue({ code })
}

/** mock auth.api 的 wechatLogin */
jest.mock('@/services/api/auth.api', () => ({
  wechatLogin: jest.fn(),
  logout: jest.fn(),
}))

/** mock user.api 的 getCurrentUser */
jest.mock('@/services/api/user.api', () => ({
  getCurrentUser: jest.fn(),
}))

import { wechatLogin, logout as logoutApi } from '@/services/api/auth.api'
import { getCurrentUser } from '@/services/api/user.api'

describe('useAuth', () => {
  beforeEach(() => {
    __resetAll()
    mockTaroLogin()
    ;(wechatLogin as jest.Mock).mockReset()
    ;(logoutApi as jest.Mock).mockReset()
    ;(getCurrentUser as jest.Mock).mockReset()
    act(() => {
      useAuthStore.setState({ user: null, isAuthenticated: false })
    })
  })

  describe('初始状态', () => {
    it('user 应为 null', () => {
      const { result } = renderHook(() => useAuth())
      expect(result.current.user).toBeNull()
    })

    it('isAuthenticated 应为 false', () => {
      const { result } = renderHook(() => useAuth())
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('loading 应为 false', () => {
      const { result } = renderHook(() => useAuth())
      expect(result.current.loading).toBe(false)
    })
  })

  describe('login', () => {
    it('正常路径：Taro.login → wechatLogin → setTokens → setUser', async () => {
      const wxResult = buildWxLoginResult()
      ;(wechatLogin as jest.Mock).mockResolvedValue(wxResult)

      const { result } = renderHook(() => useAuth())

      let loginResult: WxLoginResult | undefined
      await act(async () => {
        loginResult = await result.current.login('张三', 'https://example.com/a.png')
      })

      // 返回值
      expect(loginResult).toEqual(wxResult)

      // Taro.login 被调用
      expect(Taro.login).toHaveBeenCalledTimes(1)

      // wechatLogin 收到正确的参数
      expect(wechatLogin).toHaveBeenCalledWith('wx-code-001', '张三', 'https://example.com/a.png')

      // token 已存储
      expect(tokenStore.getAccessToken()).toBe('access-token-abc')
      expect(tokenStore.getRefreshToken()).toBe('refresh-token-xyz')

      // store 已更新
      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.id).toBe('user-001')
      expect(result.current.user?.nickname).toBe('测试用户')
      expect(result.current.user?.email).toBeNull()
      expect(result.current.user?.industryPreferences).toEqual([])
    })

    it('不传 nickname/avatarUrl 时正常登录', async () => {
      const wxResult = buildWxLoginResult()
      ;(wechatLogin as jest.Mock).mockResolvedValue(wxResult)

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.login()
      })

      expect(wechatLogin).toHaveBeenCalledWith('wx-code-001', undefined, undefined)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('成功后 loading 应回到 false', async () => {
      ;(wechatLogin as jest.Mock).mockResolvedValue(buildWxLoginResult())

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.login()
      })

      expect(result.current.loading).toBe(false)
    })

    it('Taro.login 抛错时 loading 应复位且不应登录', async () => {
      ;(Taro.login as jest.Mock).mockRejectedValue(new Error('微信登录失败'))

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await expect(result.current.login()).rejects.toThrow('微信登录失败')
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(wechatLogin).not.toHaveBeenCalled()
    })

    it('wechatLogin 抛错时 loading 应复位且不应存储 token', async () => {
      ;(wechatLogin as jest.Mock).mockRejectedValue(new Error('后端登录失败'))

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await expect(result.current.login()).rejects.toThrow('后端登录失败')
      })

      expect(result.current.loading).toBe(false)
      expect(result.current.isAuthenticated).toBe(false)
      expect(tokenStore.getAccessToken()).toBeNull()
    })

    it('登录成功后 user 应包含 createdAt 字段', async () => {
      const wxResult = buildWxLoginResult()
      ;(wechatLogin as jest.Mock).mockResolvedValue(wxResult)

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await result.current.login()
      })

      expect(result.current.user?.createdAt).toBeDefined()
      // createdAt 应为 ISO 字符串
      expect(typeof result.current.user?.createdAt).toBe('string')
      expect(new Date(result.current.user!.createdAt!).toString()).not.toBe('Invalid Date')
    })
  })

  describe('logout', () => {
    it('正常路径：logoutApi → tokenStore.clear → clearAuthState', async () => {
      ;(logoutApi as jest.Mock).mockResolvedValue(undefined)

      // 先登录
      ;(wechatLogin as jest.Mock).mockResolvedValue(buildWxLoginResult())
      const { result } = renderHook(() => useAuth())
      await act(async () => {
        await result.current.login()
      })
      expect(result.current.isAuthenticated).toBe(true)
      expect(tokenStore.getAccessToken()).not.toBeNull()

      // 登出
      await act(async () => {
        await result.current.logout()
      })

      expect(logoutApi).toHaveBeenCalledTimes(1)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(tokenStore.getAccessToken()).toBeNull()
      expect(tokenStore.getRefreshToken()).toBeNull()
    })

    it('logoutApi 抛错时仍应清空本地状态', async () => {
      ;(logoutApi as jest.Mock).mockRejectedValue(new Error('网络错误'))

      // 先登录
      ;(wechatLogin as jest.Mock).mockResolvedValue(buildWxLoginResult())
      const { result } = renderHook(() => useAuth())
      await act(async () => {
        await result.current.login()
      })

      // 登出（不应抛错）
      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(tokenStore.getAccessToken()).toBeNull()
    })

    it('未登录时 logout 不应抛错', async () => {
      ;(logoutApi as jest.Mock).mockResolvedValue(undefined)

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await expect(result.current.logout()).resolves.toBeUndefined()
      })

      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  describe('refreshUser', () => {
    it('正常路径：getCurrentUser → setUser', async () => {
      const freshUser = {
        id: 'user-001',
        openId: 'wx-open-id',
        nickname: '新昵称',
        avatarUrl: 'https://example.com/new.png',
        mobile: '13900139000',
        email: 'new@example.com',
        totalPoints: 500,
        industryPreferences: ['tech'],
        status: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      }
      ;(getCurrentUser as jest.Mock).mockResolvedValue(freshUser)

      const { result } = renderHook(() => useAuth())

      let returned: unknown
      await act(async () => {
        returned = await result.current.refreshUser()
      })

      expect(getCurrentUser).toHaveBeenCalledTimes(1)
      expect(returned).toEqual(freshUser)
      expect(result.current.user?.nickname).toBe('新昵称')
      expect(result.current.user?.totalPoints).toBe(500)
      expect(result.current.isAuthenticated).toBe(true)
    })

    it('getCurrentUser 抛错时应向上抛出', async () => {
      ;(getCurrentUser as jest.Mock).mockRejectedValue(new Error('获取用户失败'))

      const { result } = renderHook(() => useAuth())

      await act(async () => {
        await expect(result.current.refreshUser()).rejects.toThrow('获取用户失败')
      })

      expect(result.current.user).toBeNull()
    })
  })

  describe('Hook 稳定性', () => {
    it('多次渲染 login 函数引用应稳定（useCallback 依赖 setUser）', () => {
      const { result, rerender } = renderHook(() => useAuth())
      const login1 = result.current.login
      const logout1 = result.current.logout
      const refreshUser1 = result.current.refreshUser

      rerender()

      // 引用应保持稳定（store 的 setUser 引用不变）
      expect(result.current.login).toBe(login1)
      expect(result.current.logout).toBe(logout1)
      expect(result.current.refreshUser).toBe(refreshUser1)
    })
  })
})
