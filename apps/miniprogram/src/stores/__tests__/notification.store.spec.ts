/**
 * Notification Store 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（unreadCount=0）
 *  - setUnreadCount → 设置未读数
 *  - setUnreadCount 负数 → 钳制为 0
 *  - increment → +1
 *  - decrement → -1（不低于 0）
 *  - decrement at 0 → 保持 0
 */
import { useNotificationStore } from '../notification.store'

describe('NotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ unreadCount: 0 })
  })

  describe('初始状态', () => {
    it('unreadCount 应为 0', () => {
      expect(useNotificationStore.getState().unreadCount).toBe(0)
    })
  })

  describe('setUnreadCount', () => {
    it('应设置 unreadCount', () => {
      useNotificationStore.getState().setUnreadCount(5)
      expect(useNotificationStore.getState().unreadCount).toBe(5)
    })

    it('设置 0', () => {
      useNotificationStore.getState().setUnreadCount(5)
      useNotificationStore.getState().setUnreadCount(0)
      expect(useNotificationStore.getState().unreadCount).toBe(0)
    })

    it('负数应钳制为 0', () => {
      useNotificationStore.getState().setUnreadCount(-3)
      expect(useNotificationStore.getState().unreadCount).toBe(0)
    })
  })

  describe('increment', () => {
    it('应 +1', () => {
      useNotificationStore.getState().setUnreadCount(3)
      useNotificationStore.getState().increment()
      expect(useNotificationStore.getState().unreadCount).toBe(4)
    })

    it('从 0 increment', () => {
      useNotificationStore.getState().increment()
      expect(useNotificationStore.getState().unreadCount).toBe(1)
    })

    it('多次 increment 应累加', () => {
      useNotificationStore.getState().increment()
      useNotificationStore.getState().increment()
      useNotificationStore.getState().increment()
      expect(useNotificationStore.getState().unreadCount).toBe(3)
    })
  })

  describe('decrement', () => {
    it('应 -1', () => {
      useNotificationStore.getState().setUnreadCount(5)
      useNotificationStore.getState().decrement()
      expect(useNotificationStore.getState().unreadCount).toBe(4)
    })

    it('减到 0 不再继续减少', () => {
      useNotificationStore.getState().setUnreadCount(1)
      useNotificationStore.getState().decrement()
      expect(useNotificationStore.getState().unreadCount).toBe(0)

      useNotificationStore.getState().decrement()
      expect(useNotificationStore.getState().unreadCount).toBe(0)
    })

    it('从 0 decrement 保持 0', () => {
      useNotificationStore.getState().decrement()
      expect(useNotificationStore.getState().unreadCount).toBe(0)
    })
  })
})
