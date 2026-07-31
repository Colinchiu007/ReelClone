/**
 * @jest-environment jsdom
 *
 * Workbench API 单元测试
 *
 * 覆盖 workbench.api.ts 中所有 9 个函数：
 *  - createGeneration         POST   /generations
 *  - listGenerations          GET    /generations
 *  - getGeneration            GET    /generations/:id
 *  - cancelGeneration         POST   /generations/:id/cancel
 *  - retryGeneration          POST   /generations/:id/retry
 *  - listWorks                GET    /works
 *  - getWork                  GET    /works/:id
 *  - deleteWork               DELETE /works/:id
 *  - publishWorkAsTemplate    POST   /works/:id/publish-template
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（params 透传到 request 调用）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 */

import type { CreateGenerationParams, GenerationTask, PaginatedResponse, Work } from '@/types'

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
import * as workbenchApi from '../workbench.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 GenerationTask 对象 */
function buildGenerationTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    id: 'task-001',
    workId: 'work-001',
    taskType: 'TEXT_TO_VIDEO',
    provider: 'veo3',
    status: 'COMPLETED',
    retryCount: 0,
    ...overrides,
  }
}

/** 构造一个 Work 对象 */
function buildWork(overrides: Partial<Work> = {}): Work {
  return {
    id: 'work-001',
    userId: 'user-001',
    workType: 'VIDEO',
    status: 'COMPLETED',
    params: { prompt: '一只手拿起产品展示细节' },
    resultUrl: 'https://cdn.example.com/video.mp4',
    coverUrl: 'https://cdn.example.com/cover.jpg',
    consumedPoints: 100,
    createdAt: '2026-07-31T00:00:00.000Z',
    completedAt: '2026-07-31T00:01:00.000Z',
    ...overrides,
  }
}

/** 构造一个分页响应 */
function buildPaginatedResponse<T>(
  items: T[],
  overrides: Partial<PaginatedResponse<T>['data']> = {},
): PaginatedResponse<T> {
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

/** 构造一个 CreateGenerationParams 对象 */
function buildCreateParams(
  overrides: Partial<CreateGenerationParams> = {},
): CreateGenerationParams {
  return {
    generationType: 'TEXT_TO_VIDEO',
    prompt: '一只手拿起产品展示细节',
    model: 'veo3',
    resolution: '720p',
    aspectRatio: '9:16',
    duration: 5,
    ...overrides,
  }
}

// -------------------- mock 句柄 --------------------

const mockGet = request.get as jest.Mock
const mockPost = request.post as jest.Mock
const mockDelete = request.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// -------------------- 测试用例 --------------------

describe('workbenchApi', () => {
  describe('createGeneration', () => {
    it('正常路径：应请求 POST /generations 并透传 params 返回 workId/taskId', async () => {
      const params = buildCreateParams()
      const created = { workId: 'work-001', taskId: 'task-001' }
      mockPost.mockResolvedValue(created)

      const result = await workbenchApi.createGeneration(params)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/generations', params)
      expect(result).toBe(created)
    })

    it('带 referenceImages 与 idempotencyKey 时应正确透传', async () => {
      const params = buildCreateParams({
        generationType: 'IMAGE_TO_VIDEO',
        prompt: '让图片动起来',
        referenceImages: ['asset-001', 'asset-002'],
        idempotencyKey: 'idem-key-abc',
      })
      mockPost.mockResolvedValue({ workId: 'work-002', taskId: 'task-002' })

      await workbenchApi.createGeneration(params)

      expect(mockPost).toHaveBeenCalledWith('/generations', params)
    })
  })

  describe('listGenerations', () => {
    it('无参数时应请求 GET /generations 且 params 为 undefined', async () => {
      const page = buildPaginatedResponse([
        buildGenerationTask(),
        buildGenerationTask({ id: 'task-002' }),
      ])
      mockGet.mockResolvedValue(page)

      const result = await workbenchApi.listGenerations()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/generations', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 status/generationType', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse<GenerationTask>([]))

      await workbenchApi.listGenerations({ status: 'PROCESSING', generationType: 'TEXT_TO_VIDEO' })

      expect(mockGet).toHaveBeenCalledWith('/generations', {
        status: 'PROCESSING',
        generationType: 'TEXT_TO_VIDEO',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(
        buildPaginatedResponse<GenerationTask>([], { page: 2, pageSize: 20 }),
      )

      await workbenchApi.listGenerations({ page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/generations', { page: 2, pageSize: 20 })
    })
  })

  describe('getGeneration', () => {
    it('正常路径：应请求 GET /generations/:id URL 拼接正确并返回 GenerationTask', async () => {
      const task = buildGenerationTask({ id: 'task-001' })
      mockGet.mockResolvedValue(task)

      const result = await workbenchApi.getGeneration('task-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/generations/task-001')
      expect(result).toBe(task)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildGenerationTask({ id: 'task-xyz-789' }))

      await workbenchApi.getGeneration('task-xyz-789')

      expect(mockGet).toHaveBeenCalledWith('/generations/task-xyz-789')
    })
  })

  describe('cancelGeneration', () => {
    it('正常路径：应请求 POST /generations/:id/cancel URL 拼接正确并返回 void', async () => {
      mockPost.mockResolvedValue(undefined)

      const result = await workbenchApi.cancelGeneration('task-001')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/generations/task-001/cancel')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue(undefined)

      await workbenchApi.cancelGeneration('task-cancel-999')

      expect(mockPost).toHaveBeenCalledWith('/generations/task-cancel-999/cancel')
    })
  })

  describe('retryGeneration', () => {
    it('正常路径：应请求 POST /generations/:id/retry URL 拼接正确并返回 taskId', async () => {
      const retryResult = { taskId: 'task-new-001' }
      mockPost.mockResolvedValue(retryResult)

      const result = await workbenchApi.retryGeneration('task-001')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/generations/task-001/retry')
      expect(result).toBe(retryResult)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue({ taskId: 'task-new-789' })

      await workbenchApi.retryGeneration('task-retry-789')

      expect(mockPost).toHaveBeenCalledWith('/generations/task-retry-789/retry')
    })
  })

  describe('listWorks', () => {
    it('无参数时应请求 GET /works 且 params 为 undefined', async () => {
      const page = buildPaginatedResponse([buildWork(), buildWork({ id: 'work-002' })])
      mockGet.mockResolvedValue(page)

      const result = await workbenchApi.listWorks()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/works', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 status/workType', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse<Work>([]))

      await workbenchApi.listWorks({ status: 'COMPLETED', workType: 'VIDEO' })

      expect(mockGet).toHaveBeenCalledWith('/works', {
        status: 'COMPLETED',
        workType: 'VIDEO',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse<Work>([], { page: 1, pageSize: 50 }))

      await workbenchApi.listWorks({ page: 1, pageSize: 50 })

      expect(mockGet).toHaveBeenCalledWith('/works', { page: 1, pageSize: 50 })
    })
  })

  describe('getWork', () => {
    it('正常路径：应请求 GET /works/:id URL 拼接正确并返回 Work', async () => {
      const work = buildWork({ id: 'work-001' })
      mockGet.mockResolvedValue(work)

      const result = await workbenchApi.getWork('work-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/works/work-001')
      expect(result).toBe(work)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildWork({ id: 'work-abc-789' }))

      await workbenchApi.getWork('work-abc-789')

      expect(mockGet).toHaveBeenCalledWith('/works/work-abc-789')
    })
  })

  describe('deleteWork', () => {
    it('正常路径：应请求 DELETE /works/:id URL 拼接正确并返回 void', async () => {
      mockDelete.mockResolvedValue(undefined)

      const result = await workbenchApi.deleteWork('work-001')

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('/works/work-001')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockDelete.mockResolvedValue(undefined)

      await workbenchApi.deleteWork('work-del-789')

      expect(mockDelete).toHaveBeenCalledWith('/works/work-del-789')
    })
  })

  describe('publishWorkAsTemplate', () => {
    it('正常路径：应请求 POST /works/:id/publish-template URL 与 body 拼接正确', async () => {
      const params = {
        title: '好物开箱三连',
        description: '适用于新品开箱展示',
        category: '开箱',
        industry: '好物种草',
        platform: 'DOUYIN',
        tags: ['开箱', '新品'],
      }
      const published = { templateId: 'tpl-pub-001' }
      mockPost.mockResolvedValue(published)

      const result = await workbenchApi.publishWorkAsTemplate('work-001', params)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/works/work-001/publish-template', params)
      expect(result).toBe(published)
    })

    it('最小参数（仅 title）应正确调用', async () => {
      const params = { title: '简单模板' }
      mockPost.mockResolvedValue({ templateId: 'tpl-pub-002' })

      await workbenchApi.publishWorkAsTemplate('work-002', params)

      expect(mockPost).toHaveBeenCalledWith('/works/work-002/publish-template', {
        title: '简单模板',
      })
    })

    it('不同 workId 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue({ templateId: 'tpl-pub-789' })

      await workbenchApi.publishWorkAsTemplate('work-pub-789', { title: 'T' })

      expect(mockPost).toHaveBeenCalledWith('/works/work-pub-789/publish-template', {
        title: 'T',
      })
    })
  })
})
