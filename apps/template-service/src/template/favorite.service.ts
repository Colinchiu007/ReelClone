/**
 * 收藏服务
 *
 * 提供模板收藏 / 取消收藏 / 我的收藏列表功能。
 * 数据来源: template 库 favorites 表 + templates 表。
 *
 * 特性:
 *  - 收藏接口幂等（已收藏不会重复创建）
 *  - 取消收藏接口幂等（未收藏不会报错）
 *  - 收藏/取消收藏时同步更新 template.favoriteCount
 *  - 收藏列表按 Favorite.createdAt 倒序
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Template,
  Favorite,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException } from '@reelclone/common';
import { PaginatedResult } from './template.service';

/**
 * 收藏服务
 */
@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(Favorite, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly favoriteRepo: Repository<Favorite>,
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
  ) {}

  /**
   * 收藏模板（幂等）
   *
   * @param userId     用户 ID
   * @param templateId 模板 ID
   * @returns { favorited: true }
   * @throws BusinessException NOT_FOUND 模板不存在
   */
  async favorite(
    userId: string,
    templateId: string,
  ): Promise<{ favorited: boolean }> {
    // 检查模板是否存在
    const template = await this.templateRepo.findOne({
      where: { id: templateId },
    });
    if (!template) {
      throw BusinessException.notFound('模板');
    }

    // 幂等检查：已收藏则直接返回
    const existing = await this.favoriteRepo.findOne({
      where: { userId, templateId },
    });
    if (existing) {
      return { favorited: true };
    }

    // 创建收藏记录
    const favorite = this.favoriteRepo.create({ userId, templateId });
    await this.favoriteRepo.save(favorite);

    // 同步更新模板收藏数
    await this.templateRepo.increment(
      { id: templateId },
      'favoriteCount',
      1,
    );

    return { favorited: true };
  }

  /**
   * 取消收藏（幂等）
   *
   * @param userId     用户 ID
   * @param templateId 模板 ID
   * @returns { favorited: false }
   */
  async unfavorite(
    userId: string,
    templateId: string,
  ): Promise<{ favorited: boolean }> {
    // 查找收藏记录
    const existing = await this.favoriteRepo.findOne({
      where: { userId, templateId },
    });

    // 幂等：未收藏则直接返回
    if (!existing) {
      return { favorited: false };
    }

    // 删除收藏记录
    await this.favoriteRepo.remove(existing);

    // 同步更新模板收藏数（不低于 0）
    await this.templateRepo.decrement(
      { id: templateId },
      'favoriteCount',
      1,
    );

    return { favorited: false };
  }

  /**
   * 我的收藏列表（分页）
   *
   * JOIN Favorite + Template，按 Favorite.createdAt 倒序。
   *
   * @param userId   用户 ID
   * @param page     页码
   * @param pageSize 每页条数
   */
  async findMyFavorites(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<Template>> {
    const qb = this.favoriteRepo.createQueryBuilder('f');

    qb.innerJoinAndSelect('f.template', 't')
      .where('f.userId = :userId', { userId })
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [favorites, total] = await qb.getManyAndCount();

    // 提取模板列表
    const list = favorites.map((f) => f.template).filter(Boolean);

    return { list, page, pageSize, total };
  }
}
