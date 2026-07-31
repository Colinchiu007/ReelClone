/**
 * @jest-environment jsdom
 *
 * Asset API 单元测试
 *
 * 覆盖 asset.api.ts 中所有 7 个函数：
 *  - getUploadToken       POST   /assets/upload-token
 *  - listAssets           GET    /assets
 *  - createAsset          POST   /assets
 *  - deleteAsset          DELETE /assets/:id
 *  - listAvatarGroups     GET    /avatar-groups
 *  - createAvatarGroup    POST   /avatar-groups
 *  - deleteAvatarGroup    DELETE /avatar-groups/:id
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（params 透传到 request 调用）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 */

import type { Asset, AvatarGroup, PaginatedResponse, UploadToken } from '@/types'

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
import * as assetApi from '../asset.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 UploadToken 对象 */
function buildUploadToken(overrides: Partial<UploadToken> = {}): UploadToken {
  return {
    uploadUrl: 'https://oss.example.com/upload',
    key: 'assets/video/abc.mp4',
    token: 'sts-token-abc',
    expireAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个 Asset 对象 */
function buildAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-001',
    userId: 'user-001',
    assetType: 'IMAGE',
    status: 'ACTIVE',
    storageKey: 'assets/image/abc.png',
    fileName: 'avatar.png',
    fileSize: 102400,
    metadata: { width: 1080, height: 1920 },
    tags: ['头像'],
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个 AvatarGroup 对象 */
function buildAvatarGroup(overrides: Partial<AvatarGroup> = {}): AvatarGroup {
  return {
    id: 'ag-001',
    userId: 'user-001',
    name: '主播形象组',
    description: '电商带货场景使用',
    avatarCount: 3,
    authorizationStatus: 'APPROVED',
    status: 'ACTIVE',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个分页响应 */
function buildPaginatedResponse(
  items: Asset[],
  overrides: Partial<PaginatedResponse<Asset>['data']> = {},
): PaginatedResponse<Asset> {
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
const mockPost = request.post as jest.Mock
const mockDelete = request.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// -------------------- 测试用例 --------------------

describe('assetApi', () => {
  describe('getUploadToken', () => {
    it('正常路径：应请求 POST /assets/upload-token 且 body 为 { fileType, fileName }', async () => {
      const token = buildUploadToken()
      mockPost.mockResolvedValue(token)

      const result = await assetApi.getUploadToken('IMAGE', 'avatar.png')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/assets/upload-token', {
        fileType: 'IMAGE',
        fileName: 'avatar.png',
      })
      expect(result).toBe(token)
    })

    it('不同 fileType/fileName 时 body 应正确拼接', async () => {
      mockPost.mockResolvedValue(buildUploadToken())

      await assetApi.getUploadToken('VIDEO', 'demo.mp4')

      expect(mockPost).toHaveBeenCalledWith('/assets/upload-token', {
        fileType: 'VIDEO',
        fileName: 'demo.mp4',
      })
    })
  })

  describe('listAssets', () => {
    it('无参数时应请求 GET /assets 且 params 为 undefined', async () => {
      const page = buildPaginatedResponse([buildAsset(), buildAsset({ id: 'asset-002' })])
      mockGet.mockResolvedValue(page)

      const result = await assetApi.listAssets()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/assets', undefined)
      expect(result).toBe(page)
    })

    it('带筛选参数时应透传 assetType/industry/keyword', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([]))

      await assetApi.listAssets({
        assetType: 'IMAGE',
        industry: '好物种草',
        keyword: '头像',
      })

      expect(mockGet).toHaveBeenCalledWith('/assets', {
        assetType: 'IMAGE',
        industry: '好物种草',
        keyword: '头像',
      })
    })

    it('带分页参数时应透传 page/pageSize', async () => {
      mockGet.mockResolvedValue(buildPaginatedResponse([], { page: 2, pageSize: 20 }))

      await assetApi.listAssets({ page: 2, pageSize: 20 })

      expect(mockGet).toHaveBeenCalledWith('/assets', { page: 2, pageSize: 20 })
    })
  })

  describe('createAsset', () => {
    it('正常路径：应请求 POST /assets 并透传 data 返回 Asset', async () => {
      const data = {
        assetType: 'IMAGE' as const,
        storageKey: 'assets/image/new.png',
        fileName: 'new-avatar.png',
        fileSize: 204800,
      }
      const created = buildAsset(data)
      mockPost.mockResolvedValue(created)

      const result = await assetApi.createAsset(data)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/assets', data)
      expect(result).toBe(created)
    })

    it('完整字段（含 tags/industry/metadata）应正确透传', async () => {
      const data = {
        assetType: 'VIDEO' as const,
        storageKey: 'assets/video/demo.mp4',
        fileName: 'demo.mp4',
        fileSize: 5242880,
        duration: 30,
        tags: ['开箱', '新品'],
        industry: '电商',
        metadata: { width: 1080, height: 1920 },
      }
      mockPost.mockResolvedValue(buildAsset(data))

      await assetApi.createAsset(data)

      expect(mockPost).toHaveBeenCalledWith('/assets', data)
    })
  })

  describe('deleteAsset', () => {
    it('正常路径：应请求 DELETE /assets/:id URL 拼接正确并返回 void', async () => {
      mockDelete.mockResolvedValue(undefined)

      const result = await assetApi.deleteAsset('asset-001')

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('/assets/asset-001')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockDelete.mockResolvedValue(undefined)

      await assetApi.deleteAsset('asset-del-789')

      expect(mockDelete).toHaveBeenCalledWith('/assets/asset-del-789')
    })
  })

  describe('listAvatarGroups', () => {
    it('正常路径：应请求 GET /avatar-groups 并透传 AvatarGroup[] 返回值', async () => {
      const groups = [buildAvatarGroup(), buildAvatarGroup({ id: 'ag-002' })]
      mockGet.mockResolvedValue(groups)

      const result = await assetApi.listAvatarGroups()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/avatar-groups')
      expect(result).toBe(groups)
    })

    it('返回值应等于 request.get 的返回值（透传，含多个形象组）', async () => {
      const groups = [
        buildAvatarGroup({ id: 'ag-001', name: '电商组' }),
        buildAvatarGroup({ id: 'ag-002', name: '教育组' }),
        buildAvatarGroup({ id: 'ag-003', name: '本地生活组' }),
      ]
      mockGet.mockResolvedValue(groups)

      const result = await assetApi.listAvatarGroups()

      expect(result).toEqual(groups)
      expect(result).toHaveLength(3)
      expect(result[1].name).toBe('教育组')
    })
  })

  describe('createAvatarGroup', () => {
    it('正常路径：应请求 POST /avatar-groups 并透传 data 返回 AvatarGroup', async () => {
      const data = { name: '主播形象组', description: '电商带货场景使用' }
      const created = buildAvatarGroup(data)
      mockPost.mockResolvedValue(created)

      const result = await assetApi.createAvatarGroup(data)

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/avatar-groups', data)
      expect(result).toBe(created)
    })

    it('仅 name（无 description）时应正确调用', async () => {
      const data = { name: '新形象组' }
      mockPost.mockResolvedValue(buildAvatarGroup(data))

      await assetApi.createAvatarGroup(data)

      expect(mockPost).toHaveBeenCalledWith('/avatar-groups', { name: '新形象组' })
    })
  })

  describe('deleteAvatarGroup', () => {
    it('正常路径：应请求 DELETE /avatar-groups/:id URL 拼接正确并返回 void', async () => {
      mockDelete.mockResolvedValue(undefined)

      const result = await assetApi.deleteAvatarGroup('ag-001')

      expect(mockDelete).toHaveBeenCalledTimes(1)
      expect(mockDelete).toHaveBeenCalledWith('/avatar-groups/ag-001')
      expect(result).toBeUndefined()
    })

    it('不同 id 时 URL 拼接正确', async () => {
      mockDelete.mockResolvedValue(undefined)

      await assetApi.deleteAvatarGroup('ag-del-789')

      expect(mockDelete).toHaveBeenCalledWith('/avatar-groups/ag-del-789')
    })
  })
})
