/**
 * AdminReviewService 单元测试
 *
 * 测试覆盖:
 *  - findPending: type=all/template/avatar 聚合查询 + 默认值 + 非法值回退
 *  - reviewTemplate: 成功 / 模板不存在 / 状态非待审核 / 通知推送（通过/拒绝/无提交者）
 *  - reviewAvatarGroup: 成功 / 形象组不存在 / 状态非待审核 / 通知推送（通过/过期）
 */
import { Test } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  Template,
  TemplateStatus,
  AvatarGroup,
  AuthorizationStatus,
  AvatarGroupStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { AdminReviewService } from './admin-review.service'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { ReviewAvatarGroupDto } from './dto/review-avatar-group.dto'

// -------------------- Mock 工具 --------------------

/** 创建模板 Mock 实体 */
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
    tags: [],
    useCount: 0,
    favoriteCount: 0,
    hotScore: 0,
    status: TemplateStatus.PENDING_REVIEW,
    userId: 'user-001',
    sourceWorkId: null,
    authorName: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    favorites: [],
    ...overrides,
  } as Template
}

/** 创建形象组 Mock 实体 */
function createMockAvatarGroup(overrides: Partial<AvatarGroup> = {}): AvatarGroup {
  return {
    id: 'ag-001',
    userId: 'user-001',
    name: '测试形象组',
    description: null,
    authorizationKey: 'oss://auth.pdf',
    authorizationStatus: AuthorizationStatus.PENDING,
    assetCount: 3,
    status: AvatarGroupStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    user: null,
    assets: [],
    ...overrides,
  } as AvatarGroup
}

// -------------------- 测试 --------------------

describe('AdminReviewService', () => {
  let service: AdminReviewService
  let templateRepo: jest.Mocked<Repository<Template>>
  let avatarGroupRepo: jest.Mocked<Repository<AvatarGroup>>
  let sendNotificationSpy: jest.SpyInstance

  beforeEach(async () => {
    templateRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Template>>

    avatarGroupRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AvatarGroup>>

    const configService = {
      get: jest.fn().mockReturnValue(''),
    } as unknown as ConfigService

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminReviewService,
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: templateRepo,
        },
        {
          provide: getRepositoryToken(AvatarGroup, DATABASE_CONNECTIONS.MAIN),
          useValue: avatarGroupRepo,
        },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile()

    service = moduleRef.get(AdminReviewService)
    // 拦截 HTTP 通知推送，避免测试中真实调用 notification-service
    sendNotificationSpy = jest
      .spyOn(service as any, 'sendNotification')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- findPending --------------------

  describe('findPending', () => {
    it('type=all: 同时查询模板和形象组', async () => {
      const templates = [createMockTemplate({ id: 't-1' })]
      const avatarGroups = [createMockAvatarGroup({ id: 'ag-1' })]
      templateRepo.find.mockResolvedValue(templates)
      avatarGroupRepo.find.mockResolvedValue(avatarGroups)

      const result = await service.findPending('all')

      expect(templateRepo.find).toHaveBeenCalledWith({
        where: { status: TemplateStatus.PENDING_REVIEW },
        order: { createdAt: 'ASC' },
      })
      expect(avatarGroupRepo.find).toHaveBeenCalledWith({
        where: {
          authorizationStatus: AuthorizationStatus.PENDING,
          status: AvatarGroupStatus.ACTIVE,
        },
        order: { createdAt: 'ASC' },
      })
      expect(result.templates).toEqual(templates)
      expect(result.avatarGroups).toEqual(avatarGroups)
      expect(result.total).toBe(2)
    })

    it('type=template: 仅查询模板', async () => {
      const templates = [createMockTemplate({ id: 't-1' })]
      templateRepo.find.mockResolvedValue(templates)

      const result = await service.findPending('template')

      expect(templateRepo.find).toHaveBeenCalled()
      expect(avatarGroupRepo.find).not.toHaveBeenCalled()
      expect(result.templates).toEqual(templates)
      expect(result.avatarGroups).toEqual([])
      expect(result.total).toBe(1)
    })

    it('type=avatar: 仅查询形象组', async () => {
      const avatarGroups = [createMockAvatarGroup({ id: 'ag-1' })]
      avatarGroupRepo.find.mockResolvedValue(avatarGroups)

      const result = await service.findPending('avatar')

      expect(templateRepo.find).not.toHaveBeenCalled()
      expect(avatarGroupRepo.find).toHaveBeenCalled()
      expect(result.templates).toEqual([])
      expect(result.avatarGroups).toEqual(avatarGroups)
      expect(result.total).toBe(1)
    })

    it('默认值: 未传 type 时按 all 处理', async () => {
      templateRepo.find.mockResolvedValue([])
      avatarGroupRepo.find.mockResolvedValue([])

      await service.findPending()

      expect(templateRepo.find).toHaveBeenCalled()
      expect(avatarGroupRepo.find).toHaveBeenCalled()
    })

    it('非法 type: 回退到 all', async () => {
      templateRepo.find.mockResolvedValue([])
      avatarGroupRepo.find.mockResolvedValue([])

      await service.findPending('invalid')

      expect(templateRepo.find).toHaveBeenCalled()
      expect(avatarGroupRepo.find).toHaveBeenCalled()
    })

    it('空结果: total=0', async () => {
      templateRepo.find.mockResolvedValue([])
      avatarGroupRepo.find.mockResolvedValue([])

      const result = await service.findPending('all')

      expect(result.total).toBe(0)
    })
  })

  // -------------------- reviewTemplate --------------------

  describe('reviewTemplate', () => {
    const dto: ReviewTemplateDto = {
      status: TemplateStatus.ACTIVE,
      reviewNote: '内容优质，通过',
    }

    it('审核通过: 更新 status + reviewNote + reviewedAt', async () => {
      const template = createMockTemplate({ id: 'tmpl-1' })
      templateRepo.findOne.mockResolvedValue(template)
      ;(templateRepo.save as jest.Mock).mockImplementation(async (t: any) => t)

      const result = await service.reviewTemplate('tmpl-1', dto, 'admin-1')

      expect(result.status).toBe(TemplateStatus.ACTIVE)
      expect(result.reviewNote).toBe('内容优质，通过')
      expect(result.reviewedAt).toBeInstanceOf(Date)
      expect(templateRepo.findOne).toHaveBeenCalledWith({ where: { id: 'tmpl-1' } })
      expect(templateRepo.save).toHaveBeenCalledWith(template)
    })

    it('模板不存在: 抛出 NOT_FOUND', async () => {
      templateRepo.findOne.mockResolvedValue(null)

      await expect(service.reviewTemplate('not-exist', dto, 'admin-1')).rejects.toThrow(
        BusinessException,
      )

      try {
        await service.reviewTemplate('not-exist', dto, 'admin-1')
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
      }
    })

    it('模板状态非待审核: 抛出 VALIDATION_ERROR', async () => {
      const template = createMockTemplate({
        id: 'tmpl-2',
        status: TemplateStatus.ACTIVE,
      })
      templateRepo.findOne.mockResolvedValue(template)

      await expect(service.reviewTemplate('tmpl-2', dto, 'admin-1')).rejects.toThrow(
        BusinessException,
      )

      try {
        await service.reviewTemplate('tmpl-2', dto, 'admin-1')
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
      }
    })

    it('审核通过后推送通知给提交者', async () => {
      const template = createMockTemplate({ id: 'tmpl-3', userId: 'user-123' })
      templateRepo.findOne.mockResolvedValue(template)
      ;(templateRepo.save as jest.Mock).mockImplementation(async (t: any) => t)

      await service.reviewTemplate('tmpl-3', dto, 'admin-1')

      expect(sendNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          title: '模板审核通过',
        }),
      )
    })

    it('审核拒绝后推送通知给提交者', async () => {
      const rejectDto: ReviewTemplateDto = {
        status: TemplateStatus.REJECTED,
        reviewNote: '内容不合规',
      }
      const template = createMockTemplate({ id: 'tmpl-4', userId: 'user-456' })
      templateRepo.findOne.mockResolvedValue(template)
      ;(templateRepo.save as jest.Mock).mockImplementation(async (t: any) => t)

      await service.reviewTemplate('tmpl-4', rejectDto, 'admin-1')

      expect(sendNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          title: '模板审核未通过',
        }),
      )
    })

    it('模板无提交者(userId=null)时不推送通知', async () => {
      const template = createMockTemplate({ id: 'tmpl-5', userId: null })
      templateRepo.findOne.mockResolvedValue(template)
      ;(templateRepo.save as jest.Mock).mockImplementation(async (t: any) => t)

      await service.reviewTemplate('tmpl-5', dto, 'admin-1')

      expect(sendNotificationSpy).not.toHaveBeenCalled()
    })
  })

  // -------------------- reviewAvatarGroup --------------------

  describe('reviewAvatarGroup', () => {
    const dto: ReviewAvatarGroupDto = {
      status: AuthorizationStatus.APPROVED,
      note: '授权材料齐全',
    }

    it('审核通过: 更新 authorizationStatus', async () => {
      const group = createMockAvatarGroup({ id: 'ag-1' })
      avatarGroupRepo.findOne.mockResolvedValue(group)
      avatarGroupRepo.save.mockImplementation(async (g: any) => g)

      const result = await service.reviewAvatarGroup('ag-1', dto, 'admin-1')

      expect(result.authorizationStatus).toBe(AuthorizationStatus.APPROVED)
      expect(avatarGroupRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ag-1' } })
      expect(avatarGroupRepo.save).toHaveBeenCalledWith(group)
    })

    it('形象组不存在: 抛出 NOT_FOUND', async () => {
      avatarGroupRepo.findOne.mockResolvedValue(null)

      await expect(service.reviewAvatarGroup('not-exist', dto, 'admin-1')).rejects.toThrow(
        BusinessException,
      )

      try {
        await service.reviewAvatarGroup('not-exist', dto, 'admin-1')
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND)
      }
    })

    it('形象组授权状态非待审核: 抛出 VALIDATION_ERROR', async () => {
      const group = createMockAvatarGroup({
        id: 'ag-2',
        authorizationStatus: AuthorizationStatus.APPROVED,
      })
      avatarGroupRepo.findOne.mockResolvedValue(group)

      await expect(service.reviewAvatarGroup('ag-2', dto, 'admin-1')).rejects.toThrow(
        BusinessException,
      )

      try {
        await service.reviewAvatarGroup('ag-2', dto, 'admin-1')
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR)
      }
    })

    it('审核通过后推送通知给所有者', async () => {
      const group = createMockAvatarGroup({ id: 'ag-3', userId: 'user-789' })
      avatarGroupRepo.findOne.mockResolvedValue(group)
      avatarGroupRepo.save.mockImplementation(async (g: any) => g)

      await service.reviewAvatarGroup('ag-3', dto, 'admin-1')

      expect(sendNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-789',
          title: '形象组授权审核通过',
        }),
      )
    })

    it('设置 EXPIRED 时推送过期通知', async () => {
      const expireDto: ReviewAvatarGroupDto = {
        status: AuthorizationStatus.EXPIRED,
        note: '授权已过期',
      }
      const group = createMockAvatarGroup({ id: 'ag-4', userId: 'user-000' })
      avatarGroupRepo.findOne.mockResolvedValue(group)
      avatarGroupRepo.save.mockImplementation(async (g: any) => g)

      await service.reviewAvatarGroup('ag-4', expireDto, 'admin-1')

      expect(sendNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-000',
          title: '形象组授权已过期',
        }),
      )
    })
  })
})
