/**
 * @jest-environment jsdom
 *
 * Billing API 单元测试
 *
 * 覆盖 billing.api.ts 中所有 3 个函数：
 *  - getBalance         GET /points/balance
 *  - listTransactions   GET /points/transactions
 *  - getTransaction     GET /points/transactions/:id
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（params 透传到 request 调用）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 */

import type { PaginatedResponse, PointBalance, PointTransaction } from '@/types'

/** mock request 模块 —— 屏蔽 RequestManager 真实实现，仅断言调用参数与返回值透传 */
jest.mock('../../request', () => ({
  request: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

import { request } from '../../request'
import * as billingApi from '../billing.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 PointBalance 对象 */
function buildBalance(overrides: Partial<PointBalance> = {}): PointBalance {
  return {
    balance: 1000,
    frozen: 50,
    total: 5000,
    ...overrides,
  }
}

/** 构造一个 PointTransaction 对象 */
function buildTransaction(overrides: Partial<PointTransaction> = {}): PointTransaction {
  return {
    id: 'tx-001',
    userId: 'user-001',
    workId: 'work-001',
    type: 'GENERATION',
    direction: 'DEBIT',
    amount: 100,
    balance: 900,
    description: '生成视频扣费',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个分页响应 */
function buildPaginatedResponse(
  items: PointTransaction[],
  overrides: Partial<PaginatedResponse<PointTransaction>['data']> = {},
): PaginatedResponse<PointTransaction> {
  return {
    code: 0,
    message: 'ok',
    data: {
      list: items,
      page: 1,
      pageSize: 10,
      total: items.length,
      ...overrides,
    },
  }
}

// -------------------- mock 句柄 --------------------

const mockGet = request.get as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// -------------------- 测试用例 --------------------

describe('billingApi', () => {
  describe('getBalance', () => {
    it('正常路径：应请求 GET /points/balance 并透传 PointBalance 返回值', async () => {
      const balance = buildBalance()
      mockGet.mockResolvedValue(balance)

      const result = await billingApi.getBalance()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/points/balance')
      expect(result).toBe(balance)
    })

    it('返回值应等于 request.get 的返回值（透传）', async () => {
      const balance = buildBalance({ balance: 250, frozen: 0, total: 250 })
      mockGet.mockResolvedValue(balance)

      const result = await billingApi.getBalance()

      expect(result).toEqual(balance)
      expect(result.balance).toBe(250)
    })
  })

  describe('listTransactions', () => {
    it('无参数时应请求 GET /points/transactions 且 params 为 undefined', async () => {
      const page = buildPaginatedResponse([buildTransaction(), buildTransaction({ id: 'tx-002' })])
      mockGet.mockResolvedValue(page)

      const result = await billingApi.listTransactions()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/points/transactions', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 type/direction', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await billingApi.listTransactions({ type: 'GENERATION', direction: 'DEBIT' })

      expect(mockGet).toHaveBeenCalledWith('/points/transactions', {
        type: 'GENERATION',
        direction: 'DEBIT',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([], { page: 2, pageSize: 20 }))

      await billingApi.listTransactions({ page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/points/transactions', { page: 2, pageSize: 20 })
    })

    it('同时带筛选与分页参数时应全部透传', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await billingApi.listTransactions({
        type: 'RECHARGE',
        direction: 'CREDIT',
        page: 3,
        pageSize: 15,
      })

      expect(mockGet).toHaveBeenCalledWith('/points/transactions', {
        type: 'RECHARGE',
        direction: 'CREDIT',
        page: 3,
        pageSize: 15,
      })
    })
  })

  describe('getTransaction', () => {
    it('正常路径：应请求 GET /points/transactions/:id URL 拼接正确并返回 PointTransaction', async () => {
      const tx = buildTransaction({ id: 'tx-001' })
      mockGet.mockResolvedValue(tx)

      const result = await billingApi.getTransaction('tx-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/points/transactions/tx-001')
      expect(result).toBe(tx)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildTransaction({ id: 'tx-abc-789' }))

      await billingApi.getTransaction('tx-abc-789')

      expect(mockGet).toHaveBeenCalledWith('/points/transactions/tx-abc-789')
    })
  })
})
