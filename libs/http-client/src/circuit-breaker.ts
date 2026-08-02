/**
 * 轻量熔断器（单实例，内存状态）
 *
 * 状态机：
 *  CLOSED  --连续失败达阈值-->  OPEN
 *  OPEN    --冷却时间到-->      HALF_OPEN
 *  HALF_OPEN --请求成功-->      CLOSED（重置计数）
 *  HALF_OPEN --请求失败-->      OPEN（重置冷却时间）
 *
 * 从 apps/template-service/src/template/billing.client.ts 提取，
 * 作为共享基础设施供所有 internal HTTP 客户端使用。
 */
export interface CircuitBreakerConfig {
  /** 失败次数阈值，达到后打开熔断器 */
  failureThreshold: number
  /** 冷却时间（毫秒），OPEN 后等待多久切换到 HALF_OPEN */
  cooldownMs: number
}

/** 熔断器状态 */
export enum CircuitState {
  /** 关闭（正常放行） */
  CLOSED = 'CLOSED',
  /** 打开（快速失败） */
  OPEN = 'OPEN',
  /** 半开（试探性放行） */
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  /** 当前是否允许请求通过（CLOSED 或 HALF_OPEN 放行，OPEN 拒绝） */
  allowRequest(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true
    }
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = CircuitState.HALF_OPEN
        return true
      }
      return false
    }
    // HALF_OPEN：只允许一个试探请求
    return true
  }

  /** 记录成功：重置计数，关闭熔断器 */
  recordSuccess(): void {
    this.failureCount = 0
    this.state = CircuitState.CLOSED
  }

  /** 记录失败：累加计数，达到阈值则打开熔断器 */
  recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN
    }
  }

  /** 当前状态（供测试和日志使用） */
  getState(): CircuitState {
    return this.state
  }

  /** 当前失败计数（供测试使用） */
  getFailureCount(): number {
    return this.failureCount
  }

  /** 重置到初始状态（供测试使用） */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.lastFailureTime = 0
  }
}
