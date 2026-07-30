/**
 * 模板服务
 *
 * 提供模板广场列表查询（分页 + 筛选 + 排序）和模板详情查询。
 * 用户上传视频转模板：submitUpload / getUploadStatus / findMyUploaded / internalFinalize / internalFail。
 * 模板被使用时触发积分奖励（incrementUseCount → BillingClient.reward）。
 * 数据来源: template 库 templates 表 + main 库 assets 表。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  Asset,
  AssetStatus,
  AssetType,
  DATABASE_CONNECTIONS,
  Template,
  TemplateStatus,
} from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { PublishTemplateDto } from './dto/publish-template.dto'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { UploadTemplateDto } from './dto/upload-template.dto'
import { FailTemplateDto, FinalizeTemplateInternalDto } from './dto/finalize-template.dto'
import { BillingClient } from './billing.client'

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  page: number
  pageSize: number
  total: number
}

/** 上传转模板返回 */
export interface UploadResult {
  templateId: string
  workflowId: string
  status: TemplateStatus
}

/** 上传状态查询返回 */
export interface UploadStatusResult {
  templateId: string
  workflowId: string | null
  status: TemplateStatus
  failureReason: string | null
}

/** 视频时长约束（秒） */
const MIN_VIDEO_DURATION = 3
const MAX_VIDEO_DURATION = 60

/** 默认奖励积分（可通过 TEMPLATE_REWARD_POINTS 环境变量配置） */
const DEFAULT_REWARD_POINTS = 1

/**
 * 模板服务
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name)
  private readonly rewardPoints: number

  constructor(
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(Asset, DATABASE_CONNECTIONS.MAIN)
    private readonly assetRepo: Repository<Asset>,
    private readonly billingClient: BillingClient,
    private readonly temporalService: TemporalService,
    private readonly configService: ConfigService,
  ) {
    this.rewardPoints = Number(
      this.configService.get<string>('TEMPLATE_REWARD_POINTS') ?? DEFAULT_REWARD_POINTS,
    )
  }

  /**
   * 模板广场列表（分页 + 筛选 + 排序）
   *
   * 筛选:
   *  - platform: 平台
   *  - industry: 行业
   *  - keyword:  标题模糊匹配 (ILIKE)
   *
   * 排序:
   *  - heat:   hotScore DESC（综合热度，默认）
   *  - latest: createdAt DESC（创建时间）
   *  - iq:     hotScore DESC（实体无 iqScore 字段，回退到热度）
   */
  async findAll(dto: ListTemplatesDto): Promise<PaginatedResult<Template>> {
    const { page = 1, pageSize = 20, platform, industry, keyword, sortBy = 'heat' } = dto

    const qb = this.templateRepo.createQueryBuilder('t')

    // 仅查询已上线模板
    qb.andWhere('t.status = :status', { status: TemplateStatus.ACTIVE })

    // 平台筛选
    if (platform) {
      qb.andWhere('t.platform = :platform', { platform })
    }

    // 行业筛选
    if (industry) {
      qb.andWhere('t.industry = :industry', { industry })
    }

    // 关键词筛选（标题模糊匹配）
    if (keyword) {
      qb.andWhere('t.title ILIKE :keyword', { keyword: `%${keyword}%` })
    }

    // 排序
    switch (sortBy) {
      case 'latest':
        qb.orderBy('t.createdAt', 'DESC')
        break
      case 'iq':
        // 实体无 iqScore 字段，回退到 hotScore 排序
        qb.orderBy('t.hotScore', 'DESC')
        break
      case 'heat':
      default:
        qb.orderBy('t.hotScore', 'DESC')
        break
    }

    // 分页
    const offset = (page - 1) * pageSize
    qb.skip(offset).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  /**
   * 模板详情
   *
   * @param id 模板 ID
   * @returns 模板实体
   * @throws BusinessException NOT_FOUND 模板不存在
   */
  async findOne(id: string): Promise<Template> {
    const template = await this.templateRepo.findOne({ where: { id } })
    if (!template) {
      throw BusinessException.notFound('模板')
    }
    return template
  }

  // -------------------- UGC 发布 --------------------

  /**
   * 用户发布模板（来自作品）
   *
   * 创建状态为 PENDING_REVIEW 的模板，等待运营审核。
   *
   * @param userId 用户 ID
   * @param dto    发布参数
   * @returns 创建的模板实体
   */
  async publishFromWork(userId: string, dto: PublishTemplateDto): Promise<Template> {
    const template = this.templateRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      coverKey: dto.coverKey ?? '',
      videoKey: dto.videoKey ?? null,
      prompt: dto.prompt,
      modelConfig: {},
      category: dto.category ?? null,
      industry: dto.industry ?? null,
      platform: dto.platform ?? null,
      tags: dto.tags ?? [],
      useCount: 0,
      favoriteCount: 0,
      hotScore: 0,
      status: TemplateStatus.PENDING_REVIEW,
      userId,
      sourceWorkId: dto.sourceWorkId ?? null,
      authorName: null,
      reviewNote: null,
      reviewedAt: null,
    })

    const saved = await this.templateRepo.save(template)
    this.logger.log(
      `用户发布模板 userId=${userId} templateId=${saved.id} sourceWorkId=${dto.sourceWorkId ?? 'null'}`,
    )
    return saved
  }

  /**
   * 查询待审核模板（运营使用）
   *
   * @param page     页码
   * @param pageSize 每页条数
   */
  async findPendingReview(page: number, pageSize: number): Promise<PaginatedResult<Template>> {
    const qb = this.templateRepo.createQueryBuilder('t')
    qb.andWhere('t.status = :status', {
      status: TemplateStatus.PENDING_REVIEW,
    })
    qb.orderBy('t.createdAt', 'ASC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }

  /**
   * 审核模板
   *
   * @param id  模板 ID
   * @param dto 审核参数（status + reviewNote）
   * @returns 更新后的模板实体
   */
  async review(id: string, dto: ReviewTemplateDto): Promise<Template> {
    const template = await this.templateRepo.findOne({ where: { id } })
    if (!template) {
      throw BusinessException.notFound('模板')
    }

    // 仅待审核状态可审核
    if (template.status !== TemplateStatus.PENDING_REVIEW) {
      throw BusinessException.validationError(`模板当前状态为 ${template.status}，无法审核`)
    }

    template.status = dto.status
    template.reviewNote = dto.reviewNote ?? null
    template.reviewedAt = new Date()

    return this.templateRepo.save(template)
  }

  /**
   * 模板使用次数 +1（含积分奖励）
   *
   * 用于"基于模板创作"时调用（workbench-service 通过 HTTP 调用）。
   * 触发条件：模板 userId 非空（用户上传的模板才奖励）。
   * 幂等保证：idempotencyKey = `reward:template:{templateId}:use:{useCount}`，
   *           useCount 为自增前的值，保证每次使用只奖励一次。
   * 失败容错：积分奖励失败不影响主流程（仅记录日志），避免业务请求因积分服务抖动而失败。
   *
   * @param id 模板 ID
   */
  async incrementUseCount(id: string): Promise<void> {
    // 1. 查询模板（需取得 userId 和当前 useCount 用于幂等键）
    const template = await this.templateRepo.findOne({ where: { id } })
    if (!template) {
      throw BusinessException.notFound('模板')
    }

    // 2. 自增 useCount（乐观自增，避免并发覆盖）
    await this.templateRepo.increment({ id }, 'useCount', 1)

    // 3. 触发积分奖励（仅对用户上传的模板）
    if (template.userId) {
      const useCountBefore = Number(template.useCount ?? 0)
      const idempotencyKey = `reward:template:${id}:use:${useCountBefore}`
      try {
        await this.billingClient.reward({
          userId: template.userId,
          amount: this.rewardPoints,
          templateId: id,
          idempotencyKey,
          description: `template:reward:${id}:use:${useCountBefore + 1}`,
        })
        this.logger.log(
          `模板使用奖励已发放 templateId=${id} userId=${template.userId} amount=${this.rewardPoints} useCount=${useCountBefore + 1}`,
        )
      } catch (err) {
        // 积分奖励失败不影响主流程（幂等键保证下次可补发）
        this.logger.error(
          `模板使用奖励失败 templateId=${id} userId=${template.userId} idempotencyKey=${idempotencyKey}: ${(err as Error).message}`,
        )
      }
    }
  }

  // -------------------- 用户上传视频转模板 --------------------

  /**
   * 提交上传视频转模板请求
   *
   * 业务流程:
   *  1. 校验 assetId 属于该用户 + 类型为 VIDEO + 状态 ACTIVE
   *  2. 校验视频时长 3-60s（基于 asset.duration 字段）
   *  3. 创建 ANALYZING 状态的 Template 记录（含 sourceAssetId / userId / title）
   *  4. 启动 Temporal 模板生成工作流
   *  5. 回填 workflowId 到 Template 记录
   *  6. 返回 { templateId, workflowId, status }
   *
   * @param userId 用户 ID
   * @param dto    上传参数
   */
  async submitUpload(userId: string, dto: UploadTemplateDto): Promise<UploadResult> {
    // 1. 校验资产归属与类型
    const asset = await this.assetRepo.findOne({
      where: { id: dto.assetId, userId, status: AssetStatus.ACTIVE },
    })
    if (!asset) {
      throw BusinessException.notFound('资产', { assetId: dto.assetId })
    }
    if (asset.type !== AssetType.VIDEO) {
      throw BusinessException.validationError('资产类型必须为 VIDEO')
    }

    // 2. 校验视频时长（3-60s）
    const duration = asset.duration ?? 0
    if (duration < MIN_VIDEO_DURATION || duration > MAX_VIDEO_DURATION) {
      throw BusinessException.validationError(
        `视频时长必须在 ${MIN_VIDEO_DURATION}-${MAX_VIDEO_DURATION} 秒之间，当前为 ${duration} 秒`,
      )
    }

    // 3. 创建 ANALYZING 状态的模板记录
    const template = this.templateRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      coverKey: '', // 工作流完成后回填
      videoKey: asset.ossKey,
      prompt: null,
      modelConfig: {},
      category: dto.category ?? null,
      industry: dto.industry ?? null,
      platform: dto.platform ?? null,
      tags: dto.tags ?? [],
      useCount: 0,
      favoriteCount: 0,
      hotScore: 0,
      status: TemplateStatus.ANALYZING,
      userId,
      sourceWorkId: null,
      authorName: null,
      reviewNote: null,
      reviewedAt: null,
      sourceAssetId: dto.assetId,
      videoMeta: {},
      analysisReport: {},
      workflowId: null,
      failureReason: null,
    })
    const saved = await this.templateRepo.save(template)

    // 4. 启动 Temporal 模板生成工作流
    let workflowId: string
    try {
      workflowId = await this.temporalService.startTemplateGeneration({
        templateId: saved.id,
        userId,
        ossKey: asset.ossKey,
        title: dto.title,
      })
    } catch (err) {
      // 工作流启动失败：标记模板为 ANALYSIS_FAILED，便于用户重试
      this.logger.error(`启动模板生成工作流失败 templateId=${saved.id}: ${(err as Error).message}`)
      saved.status = TemplateStatus.ANALYSIS_FAILED
      saved.failureReason = `工作流启动失败: ${(err as Error).message}`
      await this.templateRepo.save(saved)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '模板生成工作流启动失败，请稍后重试', {
        templateId: saved.id,
        message: (err as Error).message,
      })
    }

    // 5. 回填 workflowId
    saved.workflowId = workflowId
    await this.templateRepo.save(saved)

    this.logger.log(
      `用户上传视频转模板已提交 userId=${userId} templateId=${saved.id} assetId=${dto.assetId} workflowId=${workflowId}`,
    )

    return {
      templateId: saved.id,
      workflowId,
      status: TemplateStatus.ANALYZING,
    }
  }

  /**
   * 查询上传转模板进度
   *
   * 前端通过轮询此接口获取分析状态（ANALYZING → ACTIVE / ANALYSIS_FAILED）。
   *
   * @param workflowId 工作流 ID
   * @param userId     用户 ID（鉴权校验，只能查自己的）
   */
  async getUploadStatus(workflowId: string, userId: string): Promise<UploadStatusResult> {
    const template = await this.templateRepo.findOne({
      where: { workflowId },
    })
    if (!template) {
      throw BusinessException.notFound('模板', { workflowId })
    }
    // 鉴权校验：只能查自己上传的模板
    if (template.userId !== userId) {
      throw BusinessException.forbidden('无权查询此模板状态')
    }
    return {
      templateId: template.id,
      workflowId: template.workflowId,
      status: template.status,
      failureReason: template.failureReason,
    }
  }

  /**
   * 查询我上传的模板列表
   *
   * 包含状态：ACTIVE / ANALYZING / ANALYSIS_FAILED（排除已发布作品转的模板）。
   *
   * @param userId   用户 ID
   * @param page     页码
   * @param pageSize 每页条数
   */
  async findMyUploaded(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Template>> {
    const qb = this.templateRepo.createQueryBuilder('t')
    qb.andWhere('t.userId = :userId', { userId })
    qb.andWhere('t.sourceAssetId IS NOT NULL')
    qb.andWhere('t.status IN (:...statuses)', {
      statuses: [TemplateStatus.ACTIVE, TemplateStatus.ANALYZING, TemplateStatus.ANALYSIS_FAILED],
    })
    qb.orderBy('t.createdAt', 'DESC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }

  /**
   * 内部接口：完成模板（Temporal Activity 通过 HTTP 调用）
   *
   * 由 template.activities.ts 的 finalizeTemplate Activity 调用。
   * 更新 Template 状态为 ACTIVE，并写入视频元数据、分析报告、模板建议、封面 Key。
   *
   * 幂等：仅 ANALYZING 状态可完成，重复调用返回当前状态。
   *
   * @param dto 完成参数
   */
  async internalFinalize(dto: FinalizeTemplateInternalDto): Promise<Template> {
    const template = await this.templateRepo.findOne({
      where: { id: dto.templateId },
    })
    if (!template) {
      throw BusinessException.notFound('模板', { templateId: dto.templateId })
    }

    // 幂等：已是 ACTIVE 直接返回
    if (template.status === TemplateStatus.ACTIVE) {
      return template
    }

    // 状态校验：仅 ANALYZING 可完成
    if (template.status !== TemplateStatus.ANALYZING) {
      throw BusinessException.validationError(`模板当前状态为 ${template.status}，无法完成`)
    }

    template.status = TemplateStatus.ACTIVE
    template.videoMeta = dto.meta
    template.analysisReport = dto.analysisReport
    // LLM 生成的模板建议存入 modelConfig，prompt 字段从建议中提取
    template.modelConfig = dto.templateSuggestion
    template.coverKey = dto.coverKey
    template.failureReason = null

    const saved = await this.templateRepo.save(template)
    this.logger.log(`模板生成完成 templateId=${saved.id} status=ACTIVE`)
    return saved
  }

  /**
   * 内部接口：标记模板失败（Temporal Activity 通过 HTTP 调用）
   *
   * 由 template.activities.ts 的 markTemplateFailed Activity 调用。
   * 更新 Template 状态为 ANALYSIS_FAILED，并记录失败原因。
   *
   * 幂等：已是 ANALYSIS_FAILED 直接返回。
   *
   * @param dto 失败参数
   */
  async internalFail(dto: FailTemplateDto): Promise<Template> {
    const template = await this.templateRepo.findOne({
      where: { id: dto.templateId },
    })
    if (!template) {
      throw BusinessException.notFound('模板', { templateId: dto.templateId })
    }

    // 幂等：已是 ANALYSIS_FAILED 直接返回
    if (template.status === TemplateStatus.ANALYSIS_FAILED) {
      return template
    }

    // 状态校验：仅 ANALYZING 可标记失败
    if (template.status !== TemplateStatus.ANALYZING) {
      throw BusinessException.validationError(`模板当前状态为 ${template.status}，无法标记失败`)
    }

    template.status = TemplateStatus.ANALYSIS_FAILED
    template.failureReason = dto.reason

    const saved = await this.templateRepo.save(template)
    this.logger.warn(`模板生成失败 templateId=${saved.id} reason=${dto.reason}`)
    return saved
  }

  /**
   * 查询我发布的模板
   *
   * @param userId   用户 ID
   * @param page     页码
   * @param pageSize 每页条数
   */
  async findMyPublished(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Template>> {
    const qb = this.templateRepo.createQueryBuilder('t')
    qb.andWhere('t.userId = :userId', { userId })
    qb.orderBy('t.createdAt', 'DESC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }
}
