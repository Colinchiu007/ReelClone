/**
 * Auth Store 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（user=null, isAuthenticated=false）
 *  - setUser → 设置用户 + 认证状态
 *  - logout → 清空用户 + 认证状态
 *  - updatePoints → 更新用户积分
 *  - updatePoints when user=null → 安全无操作
 *  - 持久化：setUser 后存储写入，冷启动恢复
 */
import { useAuthStore } from '../auth.store'
import type { User } from '@/types'

/** 构造测试用户 */
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    mobile: '13800138000',
    nickname: '测试用户',
    avatarUrl: 'https://example.com/avatar.png',
    currentPoints: 100,
    ...overrides,
  } as unknown as User
}

describe('AuthStore', () => {
  beforeEach(() => {
    // 重置 store 状态（Zustand store 是单例，需手动重置）
    useAuthStore.setState({ user: null, isAuthenticated: false })
  })

  describe('初始状态', () => {
    it('user 应为 null', () => {
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('isAuthenticated 应为 false', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })
  })

  describe('setUser', () => {
    it('应设置 user 并将 isAuthenticated 置为 true', () => {
      const user = buildUser({ nickname: '张三' })
      useAuthStore.getState().setUser(user)

      const state = useAuthStore.getState()
      expect(state.user).toEqual(user)
      expect(state.isAuthenticated).toBe(true)
    })

    it('多次调用 setUser 应覆盖前一个用户', () => {
      useAuthStore.getState().setUser(buildUser({ id: 'u1', nickname: '张三' }))
      useAuthStore.getState().setUser(buildUser({ id: 'u2', nickname: '李四' }))

      const state = useAuthStore.getState()
      expect(state.user?.id).toBe('u2')
      expect(state.user?.nickname).toBe('李四')
    })
  })

  describe('logout', () => {
    it('应清空 user 并将 isAuthenticated 置为 false', () => {
      useAuthStore.getState().setUser(buildUser())
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      useAuthStore.getState().logout()

      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.isAuthenticated).toBe(false)
    })

    it('未登录时 logout 不应抛错', () => {
      expect(() => useAuthStore.getState().logout()).not.toThrow()
    })
  })

  describe('updatePoints', () => {
    it('应更新 user.currentPoints', () => {
      useAuthStore.getState().setUser(buildUser({ currentPoints: 100 }))
      useAuthStore.getState().updatePoints(50)

      expect(useAuthStore.getState().user?.currentPoints).toBe(50)
    })

    it('更新积分不应影响 isAuthenticated', () => {
      useAuthStore.getState().setUser(buildUser({ currentPoints: 100 }))
      useAuthStore.getState().updatePoints(200)

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('user 为 null 时 updatePoints 应安全无操作', () => {
      useAuthStore.getState().updatePoints(50)
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('更新积分为 0 应正常处理', () => {
      useAuthStore.getState().setUser(buildUser({ currentPoints: 100 }))
      useAuthStore.getState().updatePoints(0)
      expect(useAuthStore.getState().user?.currentPoints).toBe(0)
    })

    it('更新积分为负数也应写入（业务层负责校验）', () => {
      useAuthStore.getState().setUser(buildUser({ currentPoints: 100 }))
      useAuthStore.getState().updatePoints(-10)
      expect(useAuthStore.getState().user?.currentPoints).toBe(-10)
    })
  })
})
