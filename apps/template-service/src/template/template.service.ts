/**
 * 模板服务
 *
 * 提供模板广场列表查询（分页 + 筛选 + 排序）和模板详情查询。
 * 数据来源: template 库 templates 表。
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Template, TemplateStatus, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BusinessException } from '@reelclone/common'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { PublishTemplateDto } from './dto/publish-template.dto'
import { ReviewTemplateDto } from './dto/review-template.dto'

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  page: number
  pageSize: number
  total: number
}

/**
 * 模板服务
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name)

  constructor(
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
  ) {}

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
   * 模板使用次数 +1
   *
   * 用于"基于模板创作"时调用（workbench-service 通过 HTTP 调用）。
   *
   * @param id 模板 ID
   */
  async incrementUseCount(id: string): Promise<void> {
    await this.templateRepo.increment({ id }, 'useCount', 1)
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
