/**
 * Temporal 工作流错误分类体系
 *
 * 区分业务错误（可重试/不可重试）与系统错误，
 * 帮助工作流 catch 块做出正确的补偿决策。
 *
 * 分层结构：
 *   TemporalError（基类）
 *   ├── ProviderCancellationPendingError — 取消未确认
 *   ├── ProviderStateUnknownError — 状态未知（fail-closed）
 *   ├── BillingError — 计费服务调用失败
 *   ├── ModerationRejectedError — 审核拒绝（不可重试）
 *   └── ActivityTransientError — 瞬时系统错误（可重试）
 */

// ============================================================
// 基类
// ============================================================

/**
 * Temporal 工作流错误基类。
 *
 * 所有自定义错误继承此类，包含 code 便于 catch 块
 * 通过 `err.code` 精确分类，而非依赖字符串匹配。
 */
export class TemporalError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TemporalError'
    this.code = code
  }
}

// ============================================================
// Provider 错误
// ============================================================

/**
 * Provider 取消未确认。
 *
 * 当调用 cancelTask 后无法确认 Provider 是否真正取消时抛出。
 * 工作流应保留积分预留，不执行释放。
 */
export class ProviderCancellationPendingError extends TemporalError {
  constructor(message = 'Provider 取消未确认') {
    super('PROVIDER_CANCELLATION_PENDING', message)
  }
}

/**
 * Provider 状态未知。
 *
 * 当 queryTask 返回非终态、且重试后仍无法确认时抛出。
 * 工作流应保留积分预留，交由 Reconciler 后续对账。
 */
export class ProviderStateUnknownError extends TemporalError {
  constructor(message = 'Provider 状态未知') {
    super('PROVIDER_STATE_UNKNOWN', message)
  }
}

// ============================================================
// 计费错误
// ============================================================

/**
 * 计费服务调用失败。
 *
 * billing-service 网络超时或返回业务错误时抛出。
 * Activity 会自动重试（proxyActivities retry），但超过重试上限后
 * 工作流应决定是否走失败路径释放冻结积分。
 */
export class BillingError extends TemporalError {
  constructor(message: string) {
    super('BILLING_ERROR', message)
  }
}

// ============================================================
// 审核错误
// ============================================================

/**
 * 内容安全审核拒绝。
 *
 * 视频或封面图未通过审核时抛出。属于业务终态，不可重试。
 * 工作流应直接走失败路径并通知用户。
 */
export class ModerationRejectedError extends TemporalError {
  constructor(reason?: string) {
    super('MODERATION_REJECTED', reason ?? '内容未通过安全审核')
  }
}

// ============================================================
// Activity 瞬时错误
// ============================================================

/**
 * Activity 瞬时错误（网络抖动、服务短暂不可用）。
 *
 * proxyActivities retry 会自动处理，但如果超过重试上限
 * 仍失败，工作流需要感知这是系统错误而非业务错误。
 */
export class ActivityTransientError extends TemporalError {
  constructor(message: string) {
    super('ACTIVITY_TRANSIENT', message)
  }
}
