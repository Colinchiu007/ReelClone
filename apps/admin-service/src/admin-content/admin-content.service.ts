/**
 * 内容管理服务（AdminContentService）
 *
 * 职责：
 *  1. 作品管理：全平台作品列表查询、强制下架
 *  2. 模板管理：全状态模板列表、模板上下架
 *
 * 数据访问：
 *  - 作品：main 库的 Work 仓储（@InjectRepository(Work, 'main')）
 *  - 模板：template 库的 Template 仓储（@InjectRepository(Template, 'template')）
 *
 * 下架通知：
 *  - 通过 HTTP 调用 notification-service 发送站内通知
 *  - best-effort：通知失败仅记录日志，不阻塞下架操作
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import axios from 'axios'
import { BusinessException } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  Template,
  TemplateStatus,
  Work,
  WorkStatus,
} from '@reelclone/database'
import { ListWorksDto } from './dto/list-works.dto'
import { TakedownWorkDto } from './dto/takedown-work.dto'
import { UpdateTemplateStatusDto } from './dto/update-template-status.dto'

@Injectable()
export class AdminContentService {
  private readonly logger = new Logger(AdminContentService.name)

  constructor(
    @InjectRepository(Work, DATABASE_CONNECTIONS.MAIN)
    private readonly workRepo: Repository<Work>,
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
  ) {}

  // -------------------- 作品管理 --------------------

  /**
   * 全平台作品列表（分页 + 筛选）
   *
   * 仅返回 id/title/type/status/userId/createdAt 字段，按 createdAt 降序。
   * 支持按 status / userId / startDate / endDate 筛选。
   */
  async listWorks(
    query: ListWorksDto,
  ): Promise<{ list: Work[]; page: number; pageSize: number; total: number }> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.workRepo
      .createQueryBuilder('w')
      .select(['w.id', 'w.title', 'w.type', 'w.status', 'w.userId', 'w.createdAt'])
      .orderBy('w.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (query.status) {
      qb.andWhere('w.status = :status', { status: query.status })
    }
    if (query.userId) {
      qb.andWhere('w.user_id = :userId', { userId: query.userId })
    }
    if (query.startDate) {
      qb.andWhere('w.created_at >= :startDate', {
        startDate: query.startDate,
      })
    }
    if (query.endDate) {
      qb.andWhere('w.created_at <= :endDate', { endDate: query.endDate })
    }

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  /**
   * 强制下架作品
   *
   * 1. 查找作品，不存在 → NOT_FOUND
   * 2. 将 status 改为 CANCELLED
   * 3. 记录下架日志
   * 4. 通过 HTTP 调用 notification-service 通知创作者（best-effort）
   *
   * @param workId     作品 ID
   * @param dto        下架原因
   * @param operatorId 操作者（管理员）ID
   */
  async takedownWork(
    workId: string,
    dto: TakedownWorkDto,
    operatorId: string,
  ): Promise<{ id: string; status: WorkStatus }> {
    const work = await this.workRepo.findOne({ where: { id: workId } })
    if (!work) {
      throw BusinessException.notFound('作品')
    }

    work.status = WorkStatus.CANCELLED
    await this.workRepo.save(work)

    this.logger.log(`作品下架: workId=${workId}, operator=${operatorId}, reason=${dto.reason}`)

    // 通知创作者（best-effort，失败不影响下架操作）
    await this.notifyCreator(work.userId, workId, dto.reason, operatorId)

    return { id: work.id, status: work.status }
  }

  // -------------------- 模板管理 --------------------

  /**
   * 全状态模板列表
   *
   * 返回所有模板（含 PENDING_REVIEW / ACTIVE / OFFLINE / REJECTED），
   * 按 createdAt 降序排列。
   */
  async listTemplates(): Promise<Template[]> {
    return this.templateRepo.find({
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * 模板上下架
   *
   * 1. 查找模板，不存在 → NOT_FOUND
   * 2. 更新 status 为 ACTIVE（上架）或 OFFLINE（下架）
   * 3. 记录操作日志
   *
   * @param templateId 模板 ID
   * @param dto        目标状态
   * @param operatorId 操作者（管理员）ID
   */
  async updateTemplateStatus(
    templateId: string,
    dto: UpdateTemplateStatusDto,
    operatorId: string,
  ): Promise<{ id: string; status: TemplateStatus }> {
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    })
    if (!template) {
      throw BusinessException.notFound('模板')
    }

    template.status = dto.status
    await this.templateRepo.save(template)

    this.logger.log(
      `模板状态更新: templateId=${templateId}, status=${dto.status}, operator=${operatorId}`,
    )

    return { id: template.id, status: template.status }
  }

  // -------------------- 内部方法 --------------------

  /**
   * 通过 HTTP 调用 notification-service 通知创作者作品被下架
   *
   * best-effort：失败仅记录日志，不抛出异常，不影响下架操作。
   * 使用 NOTIFICATION_SERVICE_URL 环境变量配置目标地址，
   * 请求头携带 INTERNAL_API_KEY 供 notification-service 校验内部调用。
   */
  private async notifyCreator(
    userId: string,
    workId: string,
    reason: string,
    operatorId: string,
  ): Promise<void> {
    const baseUrl = process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3008'
    const apiKey = process.env.INTERNAL_API_KEY ?? ''

    try {
      await axios.post(
        `${baseUrl}/api/v1/notifications/system`,
        {
          userId,
          title: '作品下架通知',
          content: `您的作品（ID: ${workId}）已被管理员下架。原因：${reason}`,
          data: { workId, reason, operatorId, action: 'takedown' },
        },
        {
          headers: { 'x-api-key': apiKey },
          timeout: 5000,
        },
      )
    } catch (err) {
      this.logger.warn(
        `通知创作者失败 workId=${workId} userId=${userId}: ${(err as Error).message}`,
      )
    }
  }
}
