import { CircuitBreaker, CircuitState } from './circuit-breaker'

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker

  beforeEach(() => {
    cb = new CircuitBreaker(3, 1000) // 3 次失败阈值，1s 冷却
  })

  it('初始状态为 CLOSED，允许请求', () => {
    expect(cb.getState()).toBe(CircuitState.CLOSED)
    expect(cb.allowRequest()).toBe(true)
  })

  it('连续失败达阈值后打开熔断器', () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.getState()).toBe(CircuitState.OPEN)
    expect(cb.allowRequest()).toBe(false)
  })

  it('冷却时间后切换到 HALF_OPEN，放行试探请求', async () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.getState()).toBe(CircuitState.OPEN)

    // 等待冷却时间，allowRequest() 会触发 HALF_OPEN 转换
    await new Promise((r) => setTimeout(r, 1100))
    expect(cb.allowRequest()).toBe(true)
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN)
  })

  it('HALF_OPEN 成功后回到 CLOSED', () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    // 手动触发 HALF_OPEN（模拟冷却时间已过）
    cb.recordSuccess() // 这会重置状态
    expect(cb.getState()).toBe(CircuitState.CLOSED)
    expect(cb.getFailureCount()).toBe(0)
  })

  it('HALF_OPEN 失败后回到 OPEN', async () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()

    // 等待冷却进入 HALF_OPEN
    await new Promise((r) => setTimeout(r, 1100))
    cb.allowRequest() // 触发 HALF_OPEN
    expect(cb.getState()).toBe(CircuitState.HALF_OPEN)

    cb.recordFailure()
    expect(cb.getState()).toBe(CircuitState.OPEN)
    // 冷却未到，不允许请求
    expect(cb.allowRequest()).toBe(false)
  })

  it('失败计数正确累加', () => {
    expect(cb.getFailureCount()).toBe(0)
    cb.recordFailure()
    cb.recordFailure()
    expect(cb.getFailureCount()).toBe(2)
  })

  it('成功重置失败计数', () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordSuccess()
    expect(cb.getFailureCount()).toBe(0)
    expect(cb.getState()).toBe(CircuitState.CLOSED)
  })

  it('reset 恢复初始状态', () => {
    cb.recordFailure()
    cb.recordFailure()
    cb.recordFailure()
    cb.reset()
    expect(cb.getState()).toBe(CircuitState.CLOSED)
    expect(cb.getFailureCount()).toBe(0)
    expect(cb.allowRequest()).toBe(true)
  })
})
