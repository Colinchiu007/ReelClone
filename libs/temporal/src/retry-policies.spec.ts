/**
 * retry-policies 单元测试
 *
 * 验证共享重试策略配置的正确性：
 *  - 业务工作流 maximumAttempts ≥ 2（允许基础设施故障自动恢复）
 *  - nonRetryableErrorTypes 包含业务终态错误码
 *  - Reconciler 保持 maximumAttempts: 1（单实例长运行工作流）
 *  - 所有策略的 backoff 系数一致
 */
import {
  NON_RETRYABLE_ERROR_TYPES,
  VIDEO_GENERATION_RETRY,
  BENCHMARK_ANALYSIS_RETRY,
  TEMPLATE_GENERATION_RETRY,
  RECONCILER_RETRY,
} from './retry-policies'

describe('retry-policies', () => {
  describe('NON_RETRYABLE_ERROR_TYPES', () => {
    it('包含 PROVIDER_CANCELLATION_PENDING（取消未确认）', () => {
      expect(NON_RETRYABLE_ERROR_TYPES).toContain('PROVIDER_CANCELLATION_PENDING')
    })

    it('包含 MODERATION_REJECTED（审核拒绝）', () => {
      expect(NON_RETRYABLE_ERROR_TYPES).toContain('MODERATION_REJECTED')
    })

    it('不包含 PROVIDER_STATE_UNKNOWN（应允许重试）', () => {
      expect(NON_RETRYABLE_ERROR_TYPES).not.toContain('PROVIDER_STATE_UNKNOWN')
    })

    it('不包含 BILLING_ERROR（应允许重试）', () => {
      expect(NON_RETRYABLE_ERROR_TYPES).not.toContain('BILLING_ERROR')
    })
  })

  describe('业务工作流重试策略', () => {
    const businessRetries = [
      { name: 'VIDEO_GENERATION_RETRY', policy: VIDEO_GENERATION_RETRY },
      { name: 'BENCHMARK_ANALYSIS_RETRY', policy: BENCHMARK_ANALYSIS_RETRY },
      { name: 'TEMPLATE_GENERATION_RETRY', policy: TEMPLATE_GENERATION_RETRY },
    ]

    it.each(businessRetries)('$name: maximumAttempts 应为 2', ({ policy }) => {
      expect(policy.maximumAttempts).toBe(2)
    })

    it.each(businessRetries)('$name: backoffCoefficient 应为 2', ({ policy }) => {
      expect(policy.backoffCoefficient).toBe(2)
    })

    it.each(businessRetries)('$name: 应配置 nonRetryableErrorTypes', ({ policy }) => {
      expect(policy.nonRetryableErrorTypes).toBeDefined()
      expect(policy.nonRetryableErrorTypes!.length).toBeGreaterThan(0)
    })

    it.each(businessRetries)(
      '$name: nonRetryableErrorTypes 应包含 PROVIDER_CANCELLATION_PENDING',
      ({ policy }) => {
        expect(policy.nonRetryableErrorTypes).toContain('PROVIDER_CANCELLATION_PENDING')
      },
    )
  })

  describe('RECONCILER_RETRY', () => {
    it('maximumAttempts 应为 1（单实例长运行工作流不自动重试）', () => {
      expect(RECONCILER_RETRY.maximumAttempts).toBe(1)
    })

    it('应配置 initialInterval', () => {
      expect(RECONCILER_RETRY.initialInterval).toBe('10 seconds')
    })

    it('应配置 maximumInterval', () => {
      expect(RECONCILER_RETRY.maximumInterval).toBe('5 minutes')
    })
  })
})
