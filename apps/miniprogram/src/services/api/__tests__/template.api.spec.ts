/**
 * @jest-environment jsdom
 *
 * Template API 单元测试
 *
 * 覆盖 template.api.ts 中所有 12 个函数：
 *  - listTemplates              GET    /templates
 *  - getTemplate                GET    /templates/:id
 *  - favoriteTemplate           POST   /templates/:id/favorite
 *  - unfavoriteTemplate         DELETE /templates/:id/favorite
 *  - listFavorites              GET    /templates/favorites
 *  - getIndustryPreferences     GET    /users/industry-preferences（返回 res.industries）
 *  - setIndustryPreferences     POST   /users/industry-preferences
 *  - publishTemplate            POST   /templates/publish
 *  - listMyPublishedTemplates   GET    /templates/my-published
 *  - uploadTemplate             POST   /templates/upload
 *  - getUploadStatus            GET    /templates/upload/:wfId/status
 *  - listMyUploaded             GET    /templates/my-uploaded
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（params 透传到 request 调用）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 *  - getIndustryPreferences 特殊：返回 res.industries（解构后返回）
 */

import type {
  PaginatedResponse,
  Template,
  UploadResult,
  UploadStatusResult,
  UploadTemplateParams,
} from '@/types'

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
import * as templateApi from '../template.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 Template 对象 */
function buildTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tpl-001',
    title: '好物开箱三连',
    description: '适用于新品开箱展示，节奏明快',
    platform: 'DOUYIN',
    industries: ['好物种草'],
    tags: ['开箱', '新品'],
    coverUrl: 'https://cdn.example.com/cover.jpg',
    videoUrl: 'https://cdn.example.com/video.mp4',
    author: '测试作者',
    playCount: 1000,
    iqScore: 85,
    heat: 500,
    published: true,
    status: 'ACTIVE',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个分页响应 */
function buildPaginatedResponse(
  items: Template[],
  overrides: Partial<PaginatedResponse<Template>['data']> = {},
): PaginatedResponse<Template> {
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

/** 构造一个 UploadResult */
function buildUploadResult(overrides: Partial<UploadResult> = {}): UploadResult {
  return {
    templateId: 'tpl-new-001',
    workflowId: 'wf-001',
    status: 'ANALYZING',
    ...overrides,
  }
}

/** 构造一个 UploadStatusResult */
function buildUploadStatusResult(overrides: Partial<UploadStatusResult> = {}): UploadStatusResult {
  return {
    templateId: 'tpl-new-001',
    workflowId: 'wf-001',
    status: 'ACTIVE',
    ...overrides,
  }
}

/** 构造一个 UploadTemplateParams */
function buildUploadParams(overrides: Partial<UploadTemplateParams> = {}): UploadTemplateParams {
  return {
    assetId: 'asset-001',
    title: '上传视频转模板',
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

describe('templateApi', () => {
  describe('listTemplates', () => {
    it('无参数时应请求 GET /templates 并透传返回值', async () => {
      const page = buildPaginatedResponse([buildTemplate(), buildTemplate({ id: 'tpl-002' })])
      mockGet.mockResolvedValue(page)

      const result = await templateApi.listTemplates()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/templates', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 platform/industry/keyword/sortBy', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await templateApi.listTemplates({
        platform: 'DOUYIN',
        industry: '好物种草',
        keyword: '开箱',
        sortBy: 'heat',
      })

      expect(mockGet).toHaveBeenCalledWith('/templates', {
        platform: 'DOUYIN',
        industry: '好物种草',
        keyword: '开箱',
        sortBy: 'heat',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([], { page: 2, pageSize: 20 }))

      await templateApi.listTemplates({ page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/templates', { page: 2, pageSize: 20 })
    })
  })

  describe('getTemplate', () => {
    it('正常路径：GET /templates/:id 并返回 Template', async () => {
      const tpl = buildTemplate({ id: 'abc-123' })
      mockGet.mockResolvedValue(tpl)

      const result = await templateApi.getTemplate('abc-123')

      expect(mockGet).toHaveBeenCalledWith('/templates/abc-123')
      expect(result).toBe(tpl)
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildTemplate())

      await templateApi.getTemplate('tpl-xyz-789')

      expect(mockGet).toHaveBeenCalledWith('/templates/tpl-xyz-789')
    })
  })

  describe('favoriteTemplate', () => {
    it('正常路径：POST /templates/:id/favorite 返回 void', async () => {
      mockPost.mockResolvedValue(undefined)

      const result = await templateApi.favoriteTemplate('tpl-001')

      expect(mockPost).toHaveBeenCalledWith('/templates/tpl-001/favorite')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockPost.mockResolvedValue(undefined)

      await templateApi.favoriteTemplate('tpl-999')

      expect(mockPost).toHaveBeenCalledWith('/templates/tpl-999/favorite')
    })
  })

  describe('unfavoriteTemplate', () => {
    it('正常路径：DELETE /templates/:id/favorite 返回 void', async () => {
      mockDelete.mockResolvedValue(undefined)

      const result = await templateApi.unfavoriteTemplate('tpl-001')

      expect(mockDelete).toHaveBeenCalledWith('/templates/tpl-001/favorite')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockDelete.mockResolvedValue(undefined)

      await templateApi.unfavoriteTemplate('tpl-abc')

      expect(mockDelete).toHaveBeenCalledWith('/templates/tpl-abc/favorite')
    })
  })

  describe('listFavorites', () => {
    it('无参数时应请求 GET /templates/favorites 并透传返回值', async () => {
      const page = buildPaginatedResponse([buildTemplate({ id: 'fav-001' })])
      mockGet.mockResolvedValue(page)

      const result = await templateApi.listFavorites()

      expect(mockGet).toHaveBeenCalledWith('/templates/favorites', undefined)
      expect(result).toBe(page)
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await templateApi.listFavorites({ page: 3, pageSize: 15 })

      expect(mockGet).toHaveBeenCalledWith('/templates/favorites', { page: 3, pageSize: 15 })
    })

    it('返回值应等于 request.get 的返回值（透传）', async () => {
      const page = buildPaginatedResponse([buildTemplate(), buildTemplate({ id: 'fav-002' })])
      mockGet.mockResolvedValue(page)

      const result = await templateApi.listFavorites({ page: 1 })

      expect(result).toEqual(page)
      expect(result.data.list).toHaveLength(2)
    })
  })

  describe('getIndustryPreferences', () => {
    it('正常路径：GET /users/industry-preferences 并返回 res.industries', async () => {
      const industries = ['好物种草', '本地生活']
      mockGet.mockResolvedValue({ industries })

      const result = await templateApi.getIndustryPreferences()

      expect(mockGet).toHaveBeenCalledWith('/users/industry-preferences')
      expect(result).toBe(industries)
    })

    it('空数组时应返回空数组', async () => {
      mockGet.mockResolvedValue({ industries: [] })

      const result = await templateApi.getIndustryPreferences()

      expect(result).toEqual([])
    })

    it('URL 应为 /users/industry-preferences（非 /templates 前缀）', async () => {
      mockGet.mockResolvedValue({ industries: ['教育'] })

      await templateApi.getIndustryPreferences()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/users/industry-preferences')
    })
  })

  describe('setIndustryPreferences', () => {
    it('正常路径：POST /users/industry-preferences 且 body 为 { industries }', async () => {
      mockPost.mockResolvedValue(undefined)

      await templateApi.setIndustryPreferences(['好物种草', '本地生活'])

      expect(mockPost).toHaveBeenCalledWith('/users/industry-preferences', {
        industries: ['好物种草', '本地生活'],
      })
    })

    it('单个行业标签时也应正确包装为 { industries }', async () => {
      mockPost.mockResolvedValue(undefined)

      await templateApi.setIndustryPreferences(['教育'])

      expect(mockPost).toHaveBeenCalledWith('/users/industry-preferences', {
        industries: ['教育'],
      })
    })
  })

  describe('publishTemplate', () => {
    it('正常路径：POST /templates/publish 并透传完整 params', async () => {
      const params = {
        title: '好物开箱三连',
        description: '适用于新品开箱展示',
        prompt: '一只手拿起产品展示细节',
        coverKey: 'thumbnails/work/cover.png',
        videoKey: 'videos/work/result.mp4',
        sourceWorkId: 'work-001',
        category: '开箱',
        industry: '好物种草',
        platform: 'DOUYIN',
        tags: ['开箱', '新品'],
      }
      const published = buildTemplate({ id: 'tpl-pub-001', title: params.title })
      mockPost.mockResolvedValue(published)

      const result = await templateApi.publishTemplate(params)

      expect(mockPost).toHaveBeenCalledWith('/templates/publish', params)
      expect(result).toBe(published)
    })

    it('最小参数（仅 title + prompt）应正确调用', async () => {
      mockPost.mockResolvedValue(buildTemplate())

      await templateApi.publishTemplate({ title: '简单模板', prompt: '测试 prompt' })

      expect(mockPost).toHaveBeenCalledWith('/templates/publish', {
        title: '简单模板',
        prompt: '测试 prompt',
      })
    })

    it('返回值应等于 request.post 的返回值（Template 透传）', async () => {
      const tpl = buildTemplate({ id: 'tpl-pub-002' })
      mockPost.mockResolvedValue(tpl)

      const result = await templateApi.publishTemplate({ title: 'T', prompt: 'P' })

      expect(result).toBe(tpl)
    })
  })

  describe('listMyPublishedTemplates', () => {
    it('无参数时应请求 GET /templates/my-published', async () => {
      const page = buildPaginatedResponse([buildTemplate({ id: 'pub-001' })])
      mockGet.mockResolvedValue(page)

      const result = await templateApi.listMyPublishedTemplates()

      expect(mockGet).toHaveBeenCalledWith('/templates/my-published', undefined)
      expect(result).toBe(page)
    })

    it('带分页参数时应透传', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await templateApi.listMyPublishedTemplates({ page: 2, pageSize: 5 })

      expect(mockGet).toHaveBeenCalledWith('/templates/my-published', { page: 2, pageSize: 5 })
    })
  })

  describe('uploadTemplate', () => {
    it('正常路径：POST /templates/upload 并透传 params', async () => {
      const params = buildUploadParams({
        assetId: 'asset-abc',
        title: '上传测试',
        description: '描述',
        category: '开箱',
        industry: '好物种草',
        platform: 'DOUYIN',
        tags: ['开箱'],
      })
      const uploadResult = buildUploadResult({ templateId: 'tpl-up-001', workflowId: 'wf-abc' })
      mockPost.mockResolvedValue(uploadResult)

      const result = await templateApi.uploadTemplate(params)

      expect(mockPost).toHaveBeenCalledWith('/templates/upload', params)
      expect(result).toBe(uploadResult)
    })

    it('返回值应等于 request.post 的返回值（UploadResult 透传）', async () => {
      const res = buildUploadResult({ status: 'ANALYZING', workflowId: 'wf-xyz' })
      mockPost.mockResolvedValue(res)

      const result = await templateApi.uploadTemplate(buildUploadParams())

      expect(result).toBe(res)
      expect(result.status).toBe('ANALYZING')
    })
  })

  describe('getUploadStatus', () => {
    it('正常路径：GET /templates/upload/:wfId/status URL 拼接正确', async () => {
      const status = buildUploadStatusResult({ workflowId: 'wf-001', status: 'ACTIVE' })
      mockGet.mockResolvedValue(status)

      const result = await templateApi.getUploadStatus('wf-001')

      expect(mockGet).toHaveBeenCalledWith('/templates/upload/wf-001/status')
      expect(result).toBe(status)
    })

    it('不同 workflowId 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildUploadStatusResult())

      await templateApi.getUploadStatus('wf-abc-789')

      expect(mockGet).toHaveBeenCalledWith('/templates/upload/wf-abc-789/status')
    })
  })

  describe('listMyUploaded', () => {
    it('无参数时应请求 GET /templates/my-uploaded', async () => {
      const page = buildPaginatedResponse([buildTemplate({ id: 'up-001', status: 'ACTIVE' })])
      mockGet.mockResolvedValue(page)

      const result = await templateApi.listMyUploaded()

      expect(mockGet).toHaveBeenCalledWith('/templates/my-uploaded', undefined)
      expect(result).toBe(page)
    })

    it('带分页参数时应透传', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await templateApi.listMyUploaded({ page: 1, pageSize: 50 })

      expect(mockGet).toHaveBeenCalledWith('/templates/my-uploaded', { page: 1, pageSize: 50 })
    })
  })
})
