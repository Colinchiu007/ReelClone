/**
 * TemplateController 单元测试
 *
 * 测试覆盖:
 *  - 各端点响应格式验证
 *  - 公开端点（list / detail）调用正确服务
 *  - 需 JWT 端点（favorites / favorite / unfavorite）从 @CurrentUser 提取 userId
 *  - /favorites 路由优先于 /:id
 *  - 审核端点（pending-review / :id/review）权限元数据校验
 */
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { TemplateController } from './template.controller'
import { TemplateService } from './template.service'
import { FavoriteService } from './favorite.service'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { ROLES_KEY } from '@reelclone/common'
import { Template, TemplateStatus } from '@reelclone/database'

// -------------------- Mock 工具 --------------------

/** 创建模板 Mock */
function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    title: '测试模板',
    description: null,
    coverKey: 'oss://cover.jpg',
    videoKey: null,
    prompt: null,
    modelConfig: {},
    category: null,
    industry: '美食',
    platform: 'DOUYIN',
    tags: ['热门'],
    useCount: 100,
    favoriteCount: 50,
    hotScore: 90,
    status: TemplateStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    favorites: [],
    ...overrides,
  } as Template
}

// -------------------- 测试 --------------------

describe('TemplateController', () => {
  let controller: TemplateController
  let reflector: Reflector
  let templateService: jest.Mocked<TemplateService>
  let favoriteService: jest.Mocked<FavoriteService>

  beforeEach(async () => {
    templateService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      findPendingReview: jest.fn(),
      review: jest.fn(),
    } as unknown as jest.Mocked<TemplateService>

    favoriteService = {
      favorite: jest.fn(),
      unfavorite: jest.fn(),
      findMyFavorites: jest.fn(),
    } as unknown as jest.Mocked<FavoriteService>

    const moduleRef = await Test.createTestingModule({
      controllers: [TemplateController],
      providers: [
        Reflector,
        { provide: TemplateService, useValue: templateService },
        { provide: FavoriteService, useValue: favoriteService },
      ],
    }).compile()

    controller = moduleRef.get(TemplateController)
    reflector = moduleRef.get(Reflector)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET / (list) --------------------

  describe('list', () => {
    it('调用 templateService.findAll 并返回分页结果', async () => {
      const dto = new ListTemplatesDto()
      const mockResult = {
        list: [createMockTemplate()],
        page: 1,
        pageSize: 20,
        total: 1,
      }
      templateService.findAll.mockResolvedValue(mockResult)

      const result = await controller.list(dto)

      expect(templateService.findAll).toHaveBeenCalledWith(dto)
      expect(result).toEqual(mockResult)
      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(20)
      expect(result.total).toBe(1)
    })
  })

  // -------------------- GET /favorites --------------------

  describe('myFavorites', () => {
    it('调用 favoriteService.findMyFavorites 并返回分页结果', async () => {
      const mockResult = {
        list: [createMockTemplate({ id: 'fav-tmpl-1' })],
        page: 1,
        pageSize: 20,
        total: 1,
      }
      favoriteService.findMyFavorites.mockResolvedValue(mockResult)

      const pagination = { page: 1, pageSize: 20 }
      const result = await controller.myFavorites('user-001', pagination)

      expect(favoriteService.findMyFavorites).toHaveBeenCalledWith('user-001', 1, 20)
      expect(result).toEqual(mockResult)
    })

    it('使用默认分页参数', async () => {
      favoriteService.findMyFavorites.mockResolvedValue({
        list: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })

      await controller.myFavorites('user-001', {} as any)

      expect(favoriteService.findMyFavorites).toHaveBeenCalledWith('user-001', 1, 20)
    })
  })

  // -------------------- GET /:id (detail) --------------------

  describe('detail', () => {
    it('调用 templateService.findOne 并返回模板详情', async () => {
      const mockTemplate = createMockTemplate({ id: 'detail-1' })
      templateService.findOne.mockResolvedValue(mockTemplate)

      const result = await controller.detail('detail-1')

      expect(templateService.findOne).toHaveBeenCalledWith('detail-1')
      expect(result).toBe(mockTemplate)
    })
  })

  // -------------------- POST /:id/favorite --------------------

  describe('favorite', () => {
    it('调用 favoriteService.favorite 并返回结果', async () => {
      favoriteService.favorite.mockResolvedValue({ favorited: true })

      const result = await controller.favorite('user-001', 'tmpl-001')

      expect(favoriteService.favorite).toHaveBeenCalledWith('user-001', 'tmpl-001')
      expect(result).toEqual({ favorited: true })
    })
  })

  // -------------------- DELETE /:id/favorite --------------------

  describe('unfavorite', () => {
    it('调用 favoriteService.unfavorite 并返回结果', async () => {
      favoriteService.unfavorite.mockResolvedValue({ favorited: false })

      const result = await controller.unfavorite('user-001', 'tmpl-001')

      expect(favoriteService.unfavorite).toHaveBeenCalledWith('user-001', 'tmpl-001')
      expect(result).toEqual({ favorited: false })
    })
  })

  // -------------------- GET /pending-review --------------------

  describe('pendingReview', () => {
    it('调用 templateService.findPendingReview 并返回分页结果', async () => {
      const mockResult = {
        list: [createMockTemplate({ id: 'pending-1' })],
        page: 1,
        pageSize: 20,
        total: 1,
      }
      templateService.findPendingReview.mockResolvedValue(mockResult)

      const result = await controller.pendingReview({ page: 1, pageSize: 20 } as any)

      expect(templateService.findPendingReview).toHaveBeenCalledWith(1, 20)
      expect(result).toEqual(mockResult)
    })

    it('使用默认分页参数（page=1, pageSize=20）', async () => {
      templateService.findPendingReview.mockResolvedValue({
        list: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })

      await controller.pendingReview({} as any)

      expect(templateService.findPendingReview).toHaveBeenCalledWith(1, 20)
    })

    it('应声明 @Roles("ADMIN", "SUPER_ADMIN") 元数据', () => {
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.pendingReview,
        controller.constructor,
      ])
      expect(roles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })
  })

  // -------------------- POST /:id/review --------------------

  describe('review', () => {
    it('调用 templateService.review 并返回审核结果', async () => {
      const mockResult = createMockTemplate({ id: 'tmpl-001', status: TemplateStatus.ACTIVE })
      templateService.review.mockResolvedValue(mockResult)

      const dto = { status: 'ACTIVE', reviewNote: '通过' } as any
      const result = await controller.review('tmpl-001', dto)

      expect(templateService.review).toHaveBeenCalledWith('tmpl-001', dto)
      expect(result).toBe(mockResult)
    })

    it('应声明 @Roles("ADMIN", "SUPER_ADMIN") 元数据', () => {
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.review,
        controller.constructor,
      ])
      expect(roles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })
  })

  // -------------------- 权限元数据回归 --------------------

  describe('权限装饰器回归', () => {
    it('非审核端点不应声明 @Roles 元数据', () => {
      // list / detail / favorite / unfavorite 等普通端点不应有 @Roles 限制
      const listRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.list,
        controller.constructor,
      ])
      expect(listRoles).toBeUndefined()

      const favoriteRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.favorite,
        controller.constructor,
      ])
      expect(favoriteRoles).toBeUndefined()
    })
  })
})
