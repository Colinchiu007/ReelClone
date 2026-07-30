/**
 * @jest-environment jsdom
 *
 * useCredits Hook 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（balance=0, frozen=0, total=0）
 *  - autoFetch=true：mount 时自动 refresh
 *  - autoFetch=false：不触发 refresh
 *  - refresh 正常路径：getBalance → setBalance
 *  - refresh 异常路径：getBalance 抛错（静默失败，不抛出）
 *  - consume/recharge 委托 store
 */
import { __resetAll } from '../../../__mocks__/taro'
import { renderHook, act, flushAsync } from '../../test/renderHook'
import { useCredits } from '../useCredits'
import { usePointsStore } from '@/stores/points.store'
import type { PointBalance } from '@/types'

/** mock billing.api 的 getBalance */
jest.mock('@/services/api/billing.api', () => ({
  getBalance: jest.fn(),
}))

import { getBalance } from '@/services/api/billing.api'

/** 构造 PointBalance */
function buildBalance(overrides: Partial<PointBalance> = {}): PointBalance {
  return {
    balance: 100,
    frozen: 20,
    total: 120,
    ...overrides,
  }
}

describe('useCredits', () => {
  beforeEach(() => {
    __resetAll()
    ;(getBalance as jest.Mock).mockReset()
    act(() => {
      usePointsStore.setState({ balance: 0, frozen: 0, total: 0 })
    })
  })

  describe('初始状态', () => {
    it('balance / frozen / total 应为 0', () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance())
      const { result } = renderHook(() => useCredits(false))
      expect(result.current.balance).toBe(0)
      expect(result.current.frozen).toBe(0)
      expect(result.current.total).toBe(0)
    })

    it('应暴露 refresh / consume / recharge 方法', () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance())
      const { result } = renderHook(() => useCredits(false))
      expect(typeof result.current.refresh).toBe('function')
      expect(typeof result.current.consume).toBe('function')
      expect(typeof result.current.recharge).toBe('function')
    })
  })

  describe('autoFetch=true（默认）', () => {
    it('mount 时应自动调用 refresh', async () => {
      const bal = buildBalance({ balance: 500, frozen: 100, total: 600 })
      ;(getBalance as jest.Mock).mockResolvedValue(bal)

      renderHook(() => useCredits())

      // 等待 useEffect 触发的 refresh 完成
      await flushAsync()

      expect(getBalance).toHaveBeenCalledTimes(1)
      const state = usePointsStore.getState()
      expect(state.balance).toBe(500)
      expect(state.frozen).toBe(100)
      expect(state.total).toBe(600)
    })

    it('refresh 失败时应静默（不抛出）', async () => {
      ;(getBalance as jest.Mock).mockRejectedValue(new Error('网络错误'))

      const { result } = renderHook(() => useCredits())

      await flushAsync()

      // 未抛错，状态保持初始值
      expect(result.current.balance).toBe(0)
      expect(getBalance).toHaveBeenCalledTimes(1)
    })
  })

  describe('autoFetch=false', () => {
    it('mount 时不应调用 refresh', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance())

      renderHook(() => useCredits(false))

      await flushAsync()

      expect(getBalance).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('手动调用 refresh 应更新 store', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(
        buildBalance({ balance: 800, frozen: 50, total: 850 }),
      )

      const { result } = renderHook(() => useCredits(false))

      let returned: PointBalance | undefined
      await act(async () => {
        returned = await result.current.refresh()
      })

      expect(getBalance).toHaveBeenCalledTimes(1)
      expect(returned).toEqual({ balance: 800, frozen: 50, total: 850 })
      expect(result.current.balance).toBe(800)
      expect(result.current.frozen).toBe(50)
      expect(result.current.total).toBe(850)
    })

    it('refresh 抛错时应向上抛出', async () => {
      ;(getBalance as jest.Mock).mockRejectedValue(new Error('服务端 500'))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await expect(result.current.refresh()).rejects.toThrow('服务端 500')
      })

      // 状态不变
      expect(result.current.balance).toBe(0)
    })

    it('多次 refresh 应累次调用 getBalance', async () => {
      ;(getBalance as jest.Mock)
        .mockResolvedValueOnce(buildBalance({ balance: 100 }))
        .mockResolvedValueOnce(buildBalance({ balance: 200 }))
        .mockResolvedValueOnce(buildBalance({ balance: 300 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })
      expect(result.current.balance).toBe(100)

      await act(async () => {
        await result.current.refresh()
      })
      expect(result.current.balance).toBe(200)

      await act(async () => {
        await result.current.refresh()
      })
      expect(result.current.balance).toBe(300)

      expect(getBalance).toHaveBeenCalledTimes(3)
    })
  })

  describe('consume（委托 store）', () => {
    it('consume 应扣减 balance 和 total', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance({ balance: 100, total: 120 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })
      expect(result.current.balance).toBe(100)
      expect(result.current.total).toBe(120)

      act(() => {
        result.current.consume(30)
      })

      expect(result.current.balance).toBe(70)
      expect(result.current.total).toBe(90)
    })

    it('consume 超过 balance 时 balance 钳制为 0', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance({ balance: 50, total: 50 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })

      act(() => {
        result.current.consume(100)
      })

      expect(result.current.balance).toBe(0)
      expect(result.current.total).toBe(0)
    })
  })

  describe('recharge（委托 store）', () => {
    it('recharge 应增加 balance 和 total', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance({ balance: 100, total: 100 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })

      act(() => {
        result.current.recharge(50)
      })

      expect(result.current.balance).toBe(150)
      expect(result.current.total).toBe(150)
    })

    it('从 0 recharge 应正常累加', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance({ balance: 0, total: 0 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })

      act(() => {
        result.current.recharge(200)
      })

      expect(result.current.balance).toBe(200)
      expect(result.current.total).toBe(200)
    })
  })

  describe('组合场景', () => {
    it('refresh → consume → recharge 应正确串联', async () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance({ balance: 200, total: 200 }))

      const { result } = renderHook(() => useCredits(false))

      await act(async () => {
        await result.current.refresh()
      })

      act(() => {
        result.current.consume(50)
      })
      expect(result.current.balance).toBe(150)

      act(() => {
        result.current.recharge(30)
      })
      expect(result.current.balance).toBe(180)

      act(() => {
        result.current.consume(180)
      })
      expect(result.current.balance).toBe(0)
    })
  })

  describe('Hook 稳定性', () => {
    it('多次渲染 refresh/consume/recharge 引用应稳定', () => {
      ;(getBalance as jest.Mock).mockResolvedValue(buildBalance())

      const { result, rerender } = renderHook(() => useCredits(false))
      const refresh1 = result.current.refresh
      const consume1 = result.current.consume
      const recharge1 = result.current.recharge

      rerender()

      // consume/recharge 来自 store，store 引用稳定
      expect(result.current.refresh).toBe(refresh1)
      expect(result.current.consume).toBe(consume1)
      expect(result.current.recharge).toBe(recharge1)
    })
  })
})
