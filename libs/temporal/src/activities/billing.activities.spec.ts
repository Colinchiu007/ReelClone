/**
 * 计费 Activity 单元测试
 *
 * 覆盖 Mock 模式下的 3 个 Activity：
 * - freezeCredits: 冻结积分
 * - settleCredits: 结算积分
 * - releaseCredits: 释放积分
 *
 * 每个函数都有幂等性检查（processedKeys Set 去重）。
 * 真实模式分支需 Formance Ledger，由集成测试覆盖。
 */
import { Context } from '@temporalio/activity'
import axios from 'axios'

jest.mock('axios')

// Mock @temporalio/activity 的 Context.current()
// 必须返回同一个对象，否则 Activity 内部调用与测试中验证的不是同一个 jest.fn()
const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}
const mockContext = { log: mockLog }
jest.mock('@temporalio/activity', () => ({
  Context: {
    current: () => mockContext,
  },
}))

// 强制 Mock 模式（覆盖 NODE_ENV=production 的默认行为）
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import {
  freezeCredits,
  settleCredits,
  releaseCredits,
  billingActivities,
} from './billing.activities'
import type { BillingReservation } from '../types'

const reservation: BillingReservation = {
  freezeId: 'freeze-1',
  amount: 100,
  settleIdempotencyKey: 'settle-key-1',
  releaseIdempotencyKey: 'release-key-1',
}

describe('billing.activities (Mock 模式)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('freezeCredits', () => {
    it('Mock 模式返回 true', async () => {
      const result = await freezeCredits('user-1', 100, 'key-freeze-mock-1')
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await freezeCredits('user-2', 200, 'key-freeze-mock-2')
      expect(mockContext.log.info).toHaveBeenCalled()
    })

    it('幂等性：相同 idempotencyKey 第二次调用返回 true 且调用 ctx.log.warn', async () => {
      const idempotencyKey = 'key-freeze-idempotent'
      // 第一次调用：写入 processedKeys
      const first = await freezeCredits('user-3', 300, idempotencyKey)
      expect(first).toBe(true)
      // 第二次调用：命中幂等，走 warn 分支
      const second = await freezeCredits('user-3', 300, idempotencyKey)
      expect(second).toBe(true)
      expect(mockContext.log.warn).toHaveBeenCalled()
    })
  })

  describe('settleCredits', () => {
    it('Mock 模式返回 true', async () => {
      const result = await settleCredits('user-1', 'work-1', reservation)
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await settleCredits('user-2', 'work-2', reservation)
      expect(mockContext.log.info).toHaveBeenCalled()
    })

    it('幂等性：相同 idempotencyKey 第二次调用返回 true 且调用 ctx.log.warn', async () => {
      const first = await settleCredits('user-3', 'work-3', reservation)
      expect(first).toBe(true)
      const second = await settleCredits('user-3', 'work-3', reservation)
      expect(second).toBe(true)
      expect(mockContext.log.warn).toHaveBeenCalled()
    })
  })

  describe('releaseCredits', () => {
    it('Mock 模式返回 true', async () => {
      const result = await releaseCredits('user-1', 'work-1', reservation)
      expect(result).toBe(true)
    })

    it('调用 ctx.log.info 记录日志', async () => {
      await releaseCredits('user-2', 'work-2', reservation)
      expect(mockContext.log.info).toHaveBeenCalled()
    })

    it('幂等性：相同 idempotencyKey 第二次调用返回 true 且调用 ctx.log.warn', async () => {
      const first = await releaseCredits('user-3', 'work-3', reservation)
      expect(first).toBe(true)
      const second = await releaseCredits('user-3', 'work-3', reservation)
      expect(second).toBe(true)
      expect(mockContext.log.warn).toHaveBeenCalled()
    })
  })

  describe('billingActivities 集合', () => {
    it('包含全部 3 个 Activity 函数', () => {
      expect(typeof billingActivities.freezeCredits).toBe('function')
      expect(typeof billingActivities.settleCredits).toBe('function')
      expect(typeof billingActivities.releaseCredits).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(billingActivities.freezeCredits).toBe(freezeCredits)
      expect(billingActivities.settleCredits).toBe(settleCredits)
      expect(billingActivities.releaseCredits).toBe(releaseCredits)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const ctx = Context.current()
      expect(ctx.log.info).toBeDefined()

      await freezeCredits('user-ctx', 100, 'key-freeze-ctx')
      expect(ctx.log.info).toHaveBeenCalled()
    })
  })
})

describe('billing.activities (真实模式)', () => {
  let originalFlag: string | undefined
  let originalApiKey: string | undefined
  let originalServiceUrl: string | undefined
  const realReservation: BillingReservation = {
    freezeId: 'freeze-real-1',
    amount: 80,
    settleIdempotencyKey: 'settle-real-1',
    releaseIdempotencyKey: 'release-real-1',
  }

  beforeAll(() => {
    originalFlag = process.env.TEMPORAL_MOCK_MODE
    originalApiKey = process.env.INTERNAL_API_KEY
    originalServiceUrl = process.env.BILLING_SERVICE_URL
    process.env.TEMPORAL_MOCK_MODE = 'false'
    process.env.INTERNAL_API_KEY = 'test-internal-key'
    process.env.BILLING_SERVICE_URL = 'http://billing.test'
  })
  afterAll(() => {
    process.env.TEMPORAL_MOCK_MODE = originalFlag
    process.env.INTERNAL_API_KEY = originalApiKey
    process.env.BILLING_SERVICE_URL = originalServiceUrl
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(axios.post as jest.Mock).mockResolvedValue({
      data: { code: 0, data: { success: true, transactionId: 'billing-tx-1' } },
    })
  })

  it('freezeCredits 调用 billing-service 的内部冻结接口', async () => {
    await expect(freezeCredits('u1', 100, 'key-freeze-real', 'work-real-1')).resolves.toBe(true)

    expect(axios.post).toHaveBeenCalledWith(
      'http://billing.test/api/v1/points/freeze',
      expect.objectContaining({
        userId: 'u1',
        amount: 100,
        idempotencyKey: 'key-freeze-real',
        workId: 'work-real-1',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'test-internal-key' }),
      }),
    )
  })

  it('settleCredits 透传冻结流水和结算幂等键', async () => {
    await expect(settleCredits('u1', 'work-real-2', realReservation)).resolves.toBe(true)

    expect(axios.post).toHaveBeenCalledWith(
      'http://billing.test/api/v1/points/settle',
      expect.objectContaining({
        userId: 'u1',
        amount: 80,
        freezeId: 'freeze-real-1',
        idempotencyKey: 'settle-real-1',
        workId: 'work-real-2',
      }),
      expect.any(Object),
    )
  })

  it('releaseCredits 透传冻结流水和释放幂等键', async () => {
    await expect(releaseCredits('u1', 'work-real-3', realReservation)).resolves.toBe(true)

    expect(axios.post).toHaveBeenCalledWith(
      'http://billing.test/api/v1/points/release',
      expect.objectContaining({
        userId: 'u1',
        amount: 80,
        freezeId: 'freeze-real-1',
        idempotencyKey: 'release-real-1',
      }),
      expect.any(Object),
    )
  })

  it('缺少内部 API Key 时失败关闭', async () => {
    delete process.env.INTERNAL_API_KEY

    await expect(
      releaseCredits('u1', 'work-real-4', {
        ...realReservation,
        releaseIdempotencyKey: 'release-real-no-key',
      }),
    ).rejects.toThrow('INTERNAL_API_KEY 未配置')
  })
})
