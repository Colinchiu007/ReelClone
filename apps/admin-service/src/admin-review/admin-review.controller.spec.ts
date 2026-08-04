/**
 * AdminReviewController 单元测试
 *
 * 测试覆盖:
 *  - 各端点调用正确的服务方法
 *  - @CurrentUser 提取 operatorId 并透传
 *  - @Roles('ADMIN', 'SUPER_ADMIN') 元数据校验（类级）
 *  - type 查询参数默认值与透传
 */
import { Test } from '@nestjs/testing'
import { Reflector } from '@nestjs/core'
import { AdminReviewController } from './admin-review.controller'
import { AdminReviewService } from './admin-review.service'
import { ROLES_KEY } from '@reelclone/common'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { ReviewAvatarGroupDto } from './dto/review-avatar-group.dto'
import { ReviewAssetDto } from './dto/review-asset.dto'
import { TemplateStatus, AuthorizationStatus, AssetStatus } from '@reelclone/database'

describe('AdminReviewController', () => {
  let controller: AdminReviewController
  let reflector: Reflector
  let service: jest.Mocked<AdminReviewService>

  beforeEach(async () => {
    service = {
      findPending: jest.fn(),
      reviewTemplate: jest.fn(),
      reviewAvatarGroup: jest.fn(),
      reviewAsset: jest.fn(),
    } as unknown as jest.Mocked<AdminReviewService>

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminReviewController],
      providers: [Reflector, { provide: AdminReviewService, useValue: service }],
    }).compile()

    controller = moduleRef.get(AdminReviewController)
    reflector = moduleRef.get(Reflector)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- GET /reviews/pending --------------------

  describe('pending', () => {
    it('未传 type 时默认透传 all', async () => {
      const mockResult = {
        templates: [],
        avatarGroups: [],
        assets: [],
        total: 0,
      }
      service.findPending.mockResolvedValue(mockResult)

      const result = await controller.pending()

      expect(service.findPending).toHaveBeenCalledWith('all')
      expect(result).toEqual(mockResult)
    })

    it('透传指定的 type 参数', async () => {
      service.findPending.mockResolvedValue({
        templates: [],
        avatarGroups: [],
        assets: [],
        total: 0,
      })

      await controller.pending('template')

      expect(service.findPending).toHaveBeenCalledWith('template')
    })
  })

  // -------------------- POST /templates/:id/review --------------------

  describe('reviewTemplate', () => {
    it('调用 service.reviewTemplate 并透传 id / dto / operatorId', async () => {
      const dto: ReviewTemplateDto = {
        status: TemplateStatus.ACTIVE,
        reviewNote: '通过',
      }
      const mockResult = { id: 'tmpl-1', status: TemplateStatus.ACTIVE }
      service.reviewTemplate.mockResolvedValue(mockResult as any)

      const result = await controller.reviewTemplate('tmpl-1', dto, 'admin-1')

      expect(service.reviewTemplate).toHaveBeenCalledWith('tmpl-1', dto, 'admin-1')
      expect(result).toBe(mockResult)
    })
  })

  // -------------------- PUT /avatar-groups/:id/authorization --------------------

  describe('reviewAvatarGroup', () => {
    it('调用 service.reviewAvatarGroup 并透传 id / dto / operatorId', async () => {
      const dto: ReviewAvatarGroupDto = {
        status: AuthorizationStatus.APPROVED,
        note: '授权通过',
      }
      const mockResult = {
        id: 'ag-1',
        authorizationStatus: AuthorizationStatus.APPROVED,
      }
      service.reviewAvatarGroup.mockResolvedValue(mockResult as any)

      const result = await controller.reviewAvatarGroup('ag-1', dto, 'admin-1')

      expect(service.reviewAvatarGroup).toHaveBeenCalledWith('ag-1', dto, 'admin-1')
      expect(result).toBe(mockResult)
    })
  })

  // -------------------- POST /assets/:id/review --------------------

  describe('reviewAsset', () => {
    it('调用 service.reviewAsset 并透传 id / dto / operatorId', async () => {
      const dto: ReviewAssetDto = {
        status: AssetStatus.ACTIVE,
        reviewNote: '合规',
      }
      const mockResult = { id: 'asset-1', status: AssetStatus.ACTIVE }
      service.reviewAsset.mockResolvedValue(mockResult as any)

      const result = await controller.reviewAsset('asset-1', dto, 'admin-1')

      expect(service.reviewAsset).toHaveBeenCalledWith('asset-1', dto, 'admin-1')
      expect(result).toBe(mockResult)
    })
  })

  // -------------------- 权限元数据校验 --------------------

  describe('权限装饰器', () => {
    it('Controller 类应声明 @Roles("ADMIN", "SUPER_ADMIN")', () => {
      const roles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [AdminReviewController])
      expect(roles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })

    it('所有端点方法继承类级 @Roles', () => {
      const pendingRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.pending,
        AdminReviewController,
      ])
      expect(pendingRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const reviewTemplateRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.reviewTemplate,
        AdminReviewController,
      ])
      expect(reviewTemplateRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const reviewAvatarGroupRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.reviewAvatarGroup,
        AdminReviewController,
      ])
      expect(reviewAvatarGroupRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])

      const reviewAssetRoles = reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        controller.reviewAsset,
        AdminReviewController,
      ])
      expect(reviewAssetRoles).toEqual(['ADMIN', 'SUPER_ADMIN'])
    })
  })
})
