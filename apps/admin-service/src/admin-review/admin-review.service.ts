/**
 * 审核工作台服务
 *
 * 聚合模板审核、形象组授权审核与资产审核：
 *  - 模板：从 template 库操作 Template 实体（status: PENDING_REVIEW → ACTIVE/REJECTED）
 *  - 形象组：从 main 库操作 AvatarGroup 实体（authorizationStatus: PENDING → APPROVED/EXPIRED）
 *  - 资产：从 main 库操作 Asset 实体（status: PENDING_REVIEW → ACTIVE/REJECTED）
 *
 * 通知推送：通过 HTTP 调用 notification-service 的 /api/v1/notifications/send，
 *           携带 x-api-key（INTERNAL_API_KEY），best-effort，失败仅记录日志。
 *
 * 审核日志：暂用 Logger 记录操作者 ID + 目标 ID + 审核结果 + 时间戳，后续接入 audit_log 表。
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'
import {
  Template,
  TemplateStatus,
  AvatarGroup,
  AuthorizationStatus,
  AvatarGroupStatus,
  Asset,
  AssetStatus,
  DATABASE_CONNECTIONS,
  NotificationType,
} from '@reelclone/database'
import { BusinessException } from '@reelclone/common'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { ReviewAvatarGroupDto } from './dto/review-avatar-group.dto'
import { ReviewAssetDto } from './dto/review-asset.dto'

/** 待审核聚合结果 */
export interface PendingReviewResult {
  templates: Template[]
  avatarGroups: AvatarGroup[]
  assets: Asset[]
  total: number
}

/** 通知推送入参 */
interface SendNotificationInput {
  userId: string
  type: NotificationType
  title: string
  content: string | null
  data: Record<string, unknown>
}

/** 合法的待审核类型筛选值 */
type ReviewType = 'template' | 'avatar' | 'asset' | 'all'

@Injectable()
export class AdminReviewService {
  private readonly logger = new Logger(AdminReviewService.name)
  private readonly httpClient: InternalHttpClient

  constructor(
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(AvatarGroup, DATABASE_CONNECTIONS.MAIN)
    private readonly avatarGroupRepo: Repository<AvatarGroup>,
    @InjectRepository(Asset, DATABASE_CONNECTIONS.MAIN)
    private readonly assetRepo: Repository<Asset>,
    private readonly configService: ConfigService,
  ) {
    const baseUrl =
      this.configService.get<string>('NOTIFICATION_SERVICE_URL') ||
      process.env.NOTIFICATION_SERVICE_URL ||
      'http://localhost:3008'
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || process.env.INTERNAL_API_KEY || ''

    this.httpClient = new InternalHttpClient({
      baseUrl,
      apiKey,
    })
  }

  /**
   * 聚合查询待审核列表
   *
   * @param type 筛选类型：template | avatar | all（默认 all，非法值回退到 all）
   */
  async findPending(type: string = 'all'): Promise<PendingReviewResult> {
    const validTypes: ReviewType[] = ['template', 'avatar', 'asset', 'all']
    const queryType: ReviewType = validTypes.includes(type as ReviewType)
      ? (type as ReviewType)
      : 'all'

    let templates: Template[] = []
    let avatarGroups: AvatarGroup[] = []
    let assets: Asset[] = []

    if (queryType === 'template' || queryType === 'all') {
      templates = await this.templateRepo.find({
        where: { status: TemplateStatus.PENDING_REVIEW },
        order: { createdAt: 'ASC' },
      })
    }

    if (queryType === 'avatar' || queryType === 'all') {
      avatarGroups = await this.avatarGroupRepo.find({
        where: {
          authorizationStatus: AuthorizationStatus.PENDING,
          status: AvatarGroupStatus.ACTIVE,
        },
        order: { createdAt: 'ASC' },
      })
    }

    if (queryType === 'asset' || queryType === 'all') {
      assets = await this.assetRepo.find({
        where: { status: AssetStatus.PENDING_REVIEW },
        order: { createdAt: 'ASC' },
      })
    }

    return {
      templates,
      avatarGroups,
      assets,
      total: templates.length + avatarGroups.length + assets.length,
    }
  }

  /**
   * 模板审核
   *
   * 更新模板 status + reviewNote + reviewedAt，并推送通知给提交者。
   *
   * @param id          模板 ID
   * @param dto         审核参数
   * @param operatorId  操作者用户 ID
   * @returns 更新后的模板实体
   */
  async reviewTemplate(id: string, dto: ReviewTemplateDto, operatorId: string): Promise<Template> {
    const template = await this.templateRepo.findOne({ where: { id } })
    if (!template) {
      throw BusinessException.notFound('模板')
    }

    if (template.status !== TemplateStatus.PENDING_REVIEW) {
      throw BusinessException.validationError(`模板当前状态为 ${template.status}，无法审核`)
    }

    template.status = dto.status
    template.reviewNote = dto.reviewNote ?? null
    template.reviewedAt = new Date()

    const saved = await this.templateRepo.save(template)

    // 审核日志（后续接入 audit_log 表）
    this.logger.log(
      `审核模板 operatorId=${operatorId} templateId=${id} result=${dto.status} note=${dto.reviewNote ?? 'null'} at=${saved.reviewedAt?.toISOString()}`,
    )

    // 通知提交者（best-effort，失败不阻塞主流程）
    if (template.userId) {
      await this.sendNotification({
        userId: template.userId,
        type: NotificationType.SYSTEM,
        title: dto.status === TemplateStatus.ACTIVE ? '模板审核通过' : '模板审核未通过',
        content: dto.reviewNote ?? null,
        data: { templateId: id, status: dto.status },
      })
    }

    return saved
  }

  /**
   * 形象组授权审核
   *
   * 更新 avatar-group authorizationStatus，并推送通知给所有者。
   *
   * @param id          形象组 ID
   * @param dto         审核参数
   * @param operatorId  操作者用户 ID
   * @returns 更新后的形象组实体
   */
  async reviewAvatarGroup(
    id: string,
    dto: ReviewAvatarGroupDto,
    operatorId: string,
  ): Promise<AvatarGroup> {
    const group = await this.avatarGroupRepo.findOne({ where: { id } })
    if (!group) {
      throw BusinessException.notFound('形象组')
    }

    if (group.authorizationStatus !== AuthorizationStatus.PENDING) {
      throw BusinessException.validationError(
        `形象组当前授权状态为 ${group.authorizationStatus}，无法审核`,
      )
    }

    group.authorizationStatus = dto.status

    const saved = await this.avatarGroupRepo.save(group)

    // 审核日志（后续接入 audit_log 表）
    this.logger.log(
      `审核形象组授权 operatorId=${operatorId} avatarGroupId=${id} result=${dto.status} note=${dto.note ?? 'null'} at=${new Date().toISOString()}`,
    )

    // 通知所有者（best-effort，失败不阻塞主流程）
    await this.sendNotification({
      userId: group.userId,
      type: NotificationType.SYSTEM,
      title:
        dto.status === AuthorizationStatus.APPROVED ? '形象组授权审核通过' : '形象组授权已过期',
      content: dto.note ?? null,
      data: { avatarGroupId: id, status: dto.status },
    })

    return saved
  }

  /**
   * 资产审核
   *
   * 更新资产 status + reviewNote + reviewedAt，并推送通知给所有者。
   *
   * @param id          资产 ID
   * @param dto         审核参数
   * @param operatorId  操作者用户 ID
   * @returns 更新后的资产实体
   */
  async reviewAsset(id: string, dto: ReviewAssetDto, operatorId: string): Promise<Asset> {
    const asset = await this.assetRepo.findOne({ where: { id } })
    if (!asset) {
      throw BusinessException.notFound('资产')
    }

    if (asset.status !== AssetStatus.PENDING_REVIEW) {
      throw BusinessException.validationError(`资产当前状态为 ${asset.status}，无法审核`)
    }

    asset.status = dto.status
    asset.reviewNote = dto.reviewNote ?? null
    asset.reviewedAt = new Date()

    const saved = await this.assetRepo.save(asset)

    this.logger.log(
      `审核资产 operatorId=${operatorId} assetId=${id} result=${dto.status} note=${dto.reviewNote ?? 'null'} at=${saved.reviewedAt?.toISOString()}`,
    )

    // 通知所有者（best-effort，失败不阻塞主流程）
    await this.sendNotification({
      userId: asset.userId,
      type: NotificationType.SYSTEM,
      title: dto.status === AssetStatus.ACTIVE ? '资产审核通过' : '资产审核未通过',
      content: dto.reviewNote ?? null,
      data: { assetId: id, status: dto.status },
    })

    return saved
  }

  /**
   * 通过 HTTP 调用 notification-service 推送通知
   *
   * 端点：POST {NOTIFICATION_SERVICE_URL}/api/v1/notifications/send
   * 鉴权：x-api-key Header 携带 INTERNAL_API_KEY
   * 失败时仅记录日志，不抛出异常（best-effort）。
   */
  private async sendNotification(input: SendNotificationInput): Promise<void> {
    try {
      await this.httpClient.post(
        '/api/v1/notifications/send',
        input as unknown as Record<string, unknown>,
      )
    } catch (err) {
      this.logger.warn(
        `通知推送失败 userId=${input.userId} title=${input.title}: ${(err as Error).message}`,
      )
    }
  }
}
