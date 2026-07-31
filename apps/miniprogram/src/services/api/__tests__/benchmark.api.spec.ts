/**
 * @jest-environment jsdom
 *
 * Benchmark API 单元测试
 *
 * 覆盖 benchmark.api.ts 中所有 6 个函数：
 *  - createBenchmark      POST /benchmarks
 *  - listBenchmarks       GET  /benchmarks
 *  - getBenchmark         GET  /benchmarks/:id
 *  - getBenchmarkDetail   GET  /benchmarks/:id
 *  - cancelBenchmark      POST /benchmarks/:id/cancel
 *  - cloneBenchmark       POST /benchmarks/:id/clone
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（params 透传到 request 调用）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 */

import type { Benchmark, PaginatedResponse } from '@/types'
import type { CloneResult } from '../benchmark.api'

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
import * as benchmarkApi from '../benchmark.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 Benchmark 对象 */
function buildBenchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    id: 'bm-001',
    userId: 'user-001',
    sourceUrl: 'https://douyin.com/video/abc123',
    platform: 'DOUYIN',
    status: 'COMPLETED',
    consumedPoints: 50,
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个分页响应 */
function buildPaginatedResponse(
  items: Benchmark[],
  overrides: Partial<PaginatedResponse<Benchmark>['data']> = {},
): PaginatedResponse<Benchmark> {
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

/** 构造一个 CloneResult 对象 */
function buildCloneResult(overrides: Partial<CloneResult> = {}): CloneResult {
  return {
    benchmarkId: 'bm-001',
    prompt: '一只手拿起产品展示细节',
    model: 'veo3',
    resolution: '720p',
    aspectRatio: '9:16',
    duration: 10,
    ...overrides,
  }
}

// -------------------- mock 句柄 --------------------

const mockGet = request.get as jest.Mock
const mockPost = request.post as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// -------------------- 测试用例 --------------------

describe('benchmarkApi', () => {
  describe('createBenchmark', () => {
    it('正常路径：应请求 POST /benchmarks 并透传 data', async () => {
      const data = { sourceUrl: 'https://douyin.com/video/abc123' }
      const created = { benchmarkId: 'bm-001', status: 'PENDING' }
      mockPost.mockResolvedValue(created)

      const result = await benchmarkApi.createBenchmark(data)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/benchmarks', data)
      expect(result).toBe(created)
    })

    it('带 idempotencyKey 时应正确传递', async () => {
      const data = {
        sourceUrl: 'https://douyin.com/video/xyz789',
        idempotencyKey: 'idem-key-abc',
      }
      mockPost.mockResolvedValue({ benchmarkId: 'bm-002', status: 'PENDING' })

      await benchmarkApi.createBenchmark(data)

      expect(mockPost).toHaveBeenCalledWith('/benchmarks', {
        sourceUrl: 'https://douyin.com/video/xyz789',
        idempotencyKey: 'idem-key-abc',
      })
    })
  })

  describe('listBenchmarks', () => {
    it('无参数时应请求 GET /benchmarks 且 params 为 undefined', async () => {
      const page = buildPaginatedResponse([buildBenchmark(), buildBenchmark({ id: 'bm-002' })])
      mockGet.mockResolvedValue(page)

      const result = await benchmarkApi.listBenchmarks()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/benchmarks', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 platform/status', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await benchmarkApi.listBenchmarks({ platform: 'DOUYIN', status: 'COMPLETED' })

      expect(mockGet).toHaveBeenCalledWith('/benchmarks', {
        platform: 'DOUYIN',
        status: 'COMPLETED',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([], { page: 2, pageSize: 20 }))

      await benchmarkApi.listBenchmarks({ page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/benchmarks', { page: 2, pageSize: 20 })
    })
  })

  describe('getBenchmark', () => {
    it('正常路径：应请求 GET /benchmarks/:id URL 拼接正确并返回 Benchmark', async () => {
      const benchmark = buildBenchmark({ id: 'bm-001' })
      mockGet.mockResolvedValue(benchmark)

      const result = await benchmarkApi.getBenchmark('bm-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/benchmarks/bm-001')
      expect(result).toBe(benchmark)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildBenchmark({ id: 'bm-xyz-789' }))

      await benchmarkApi.getBenchmark('bm-xyz-789')

      expect(mockGet).toHaveBeenCalledWith('/benchmarks/bm-xyz-789')
    })
  })

  describe('getBenchmarkDetail', () => {
    it('正常路径：应请求 GET /benchmarks/:id URL 拼接正确并返回 Benchmark', async () => {
      const benchmark = buildBenchmark({ id: 'bm-001', status: 'COMPLETED' })
      mockGet.mockResolvedValue(benchmark)

      const result = await benchmarkApi.getBenchmarkDetail('bm-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/benchmarks/bm-001')
      expect(result).toBe(benchmark)
    })

    it('不同 id 时 URL 拼接正确（语义化别名与 getBenchmark 行为一致）', async () => {
      mockGet.mockResolvedValue(buildBenchmark({ id: 'bm-detail-456' }))

      await benchmarkApi.getBenchmarkDetail('bm-detail-456')

      expect(mockGet).toHaveBeenCalledWith('/benchmarks/bm-detail-456')
    })
  })

  describe('cancelBenchmark', () => {
    it('正常路径：应请求 POST /benchmarks/:id/cancel URL 拼接正确并返回 void', async () => {
      mockPost.mockResolvedValue(undefined)

      const result = await benchmarkApi.cancelBenchmark('bm-001')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/benchmarks/bm-001/cancel')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue(undefined)

      await benchmarkApi.cancelBenchmark('bm-cancel-999')

      expect(mockPost).toHaveBeenCalledWith('/benchmarks/bm-cancel-999/cancel')
    })
  })

  describe('cloneBenchmark', () => {
    it('正常路径：应请求 POST /benchmarks/:id/clone URL 拼接正确并返回 CloneResult', async () => {
      const cloneResult = buildCloneResult({ benchmarkId: 'bm-001' })
      mockPost.mockResolvedValue(cloneResult)

      const result = await benchmarkApi.cloneBenchmark('bm-001')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/benchmarks/bm-001/clone')
      expect(result).toBe(cloneResult)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue(buildCloneResult({ benchmarkId: 'bm-clone-789' }))

      await benchmarkApi.cloneBenchmark('bm-clone-789')

      expect(mockPost).toHaveBeenCalledWith('/benchmarks/bm-clone-789/clone')
    })
  })
})
