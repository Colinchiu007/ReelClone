/**
 * 模板服务
 *
 * 提供模板广场列表查询（分页 + 筛选 + 排序）和模板详情查询。
 * 数据来源: template 库 templates 表。
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Template,
  TemplateStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException } from '@reelclone/common';
import { ListTemplatesDto } from './dto/list-templates.dto';

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * 模板服务
 */
@Injectable()
export class TemplateService {
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
    const {
      page = 1,
      pageSize = 20,
      platform,
      industry,
      keyword,
      sortBy = 'heat',
    } = dto;

    const qb = this.templateRepo.createQueryBuilder('t');

    // 仅查询已上线模板
    qb.andWhere('t.status = :status', { status: TemplateStatus.ACTIVE });

    // 平台筛选
    if (platform) {
      qb.andWhere('t.platform = :platform', { platform });
    }

    // 行业筛选
    if (industry) {
      qb.andWhere('t.industry = :industry', { industry });
    }

    // 关键词筛选（标题模糊匹配）
    if (keyword) {
      qb.andWhere('t.title ILIKE :keyword', { keyword: `%${keyword}%` });
    }

    // 排序
    switch (sortBy) {
      case 'latest':
        qb.orderBy('t.createdAt', 'DESC');
        break;
      case 'iq':
        // 实体无 iqScore 字段，回退到 hotScore 排序
        qb.orderBy('t.hotScore', 'DESC');
        break;
      case 'heat':
      default:
        qb.orderBy('t.hotScore', 'DESC');
        break;
    }

    // 分页
    const offset = (page - 1) * pageSize;
    qb.skip(offset).take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    return { list, page, pageSize, total };
  }

  /**
   * 模板详情
   *
   * @param id 模板 ID
   * @returns 模板实体
   * @throws BusinessException NOT_FOUND 模板不存在
   */
  async findOne(id: string): Promise<Template> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) {
      throw BusinessException.notFound('模板');
    }
    return template;
  }
}
