/**
 * Points Store 单元测试
 *
 * 覆盖场景：
 *  - 初始状态（balance=0, frozen=0, total=0）
 *  - setBalance → 设置三个字段
 *  - consume → 扣减 balance 和 total，不影响 frozen
 *  - consume 超过 balance → balance 钳制为 0（Math.max 保护）
 *  - recharge → 增加 balance 和 total
 *  - 边界值：0 / 负数
 */
import { usePointsStore } from '../points.store'

describe('PointsStore', () => {
  beforeEach(() => {
    usePointsStore.setState({ balance: 0, frozen: 0, total: 0 })
  })

  describe('初始状态', () => {
    it('balance / frozen / total 均为 0', () => {
      const state = usePointsStore.getState()
      expect(state.balance).toBe(0)
      expect(state.frozen).toBe(0)
      expect(state.total).toBe(0)
    })
  })

  describe('setBalance', () => {
    it('应同时设置 balance / frozen / total', () => {
      usePointsStore.getState().setBalance({ balance: 100, frozen: 20, total: 120 })

      const state = usePointsStore.getState()
      expect(state.balance).toBe(100)
      expect(state.frozen).toBe(20)
      expect(state.total).toBe(120)
    })

    it('覆盖前一次设置', () => {
      usePointsStore.getState().setBalance({ balance: 100, frozen: 20, total: 120 })
      usePointsStore.getState().setBalance({ balance: 50, frozen: 0, total: 50 })

      const state = usePointsStore.getState()
      expect(state.balance).toBe(50)
      expect(state.frozen).toBe(0)
    })
  })

  describe('consume', () => {
    it('应扣减 balance 和 total，不影响 frozen', () => {
      usePointsStore.getState().setBalance({ balance: 100, frozen: 20, total: 120 })
      usePointsStore.getState().consume(30)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(70)
      expect(state.total).toBe(90)
      expect(state.frozen).toBe(20)
    })

    it('消费超过 balance 时 balance 钳制为 0（不能为负）', () => {
      usePointsStore.getState().setBalance({ balance: 50, frozen: 0, total: 50 })
      usePointsStore.getState().consume(100)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(0)
      expect(state.total).toBe(0)
    })

    it('消费 0 不影响余额', () => {
      usePointsStore.getState().setBalance({ balance: 100, frozen: 0, total: 100 })
      usePointsStore.getState().consume(0)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(100)
      expect(state.total).toBe(100)
    })

    it('从 0 余额消费仍为 0', () => {
      usePointsStore.getState().consume(50)
      const state = usePointsStore.getState()
      expect(state.balance).toBe(0)
      expect(state.total).toBe(0)
    })
  })

  describe('recharge', () => {
    it('应增加 balance 和 total', () => {
      usePointsStore.getState().setBalance({ balance: 100, frozen: 0, total: 100 })
      usePointsStore.getState().recharge(50)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(150)
      expect(state.total).toBe(150)
    })

    it('从 0 充值', () => {
      usePointsStore.getState().recharge(200)
      const state = usePointsStore.getState()
      expect(state.balance).toBe(200)
      expect(state.total).toBe(200)
    })

    it('多次充值应累加', () => {
      usePointsStore.getState().recharge(100)
      usePointsStore.getState().recharge(50)
      usePointsStore.getState().recharge(25)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(175)
      expect(state.total).toBe(175)
    })
  })

  describe('组合场景', () => {
    it('充值后消费应正确计算', () => {
      usePointsStore.getState().recharge(200)
      usePointsStore.getState().consume(50)
      usePointsStore.getState().recharge(30)
      usePointsStore.getState().consume(100)

      const state = usePointsStore.getState()
      expect(state.balance).toBe(80)
      expect(state.total).toBe(80)
    })
  })
})
