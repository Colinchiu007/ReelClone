/**
 * 行业偏好控制器
 *
 * 前缀: api/v1/users/industry-preferences（api/v1 为全局前缀）
 *
 * 端点:
 *  - GET  /   获取当前用户的行业偏好（需 JWT）
 *  - POST /   设置行业偏好（需 JWT，1-3 个行业标签）
 *
 * 行业偏好存储在 main 库 user.industryPreferences 字段（jsonb string[]）。
 */
import {
  Controller,
  Get,
  Post,
  Body,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import {
  CurrentUser,
  BusinessException,
} from '@reelclone/common';
import { IndustryPreferenceDto } from './dto/industry-preference.dto';

/** 可选行业列表（参考） */
export const INDUSTRIES = [
  '好物种草',
  '本地生活',
  '教育培训',
  'IP 口播',
  '老乡情怀',
  '人设',
  '卖货',
  '破播',
  '种草',
  '数码',
  '美妆',
  '服饰',
  '美食',
  '旅游',
  '健身',
  '母婴',
  '宠物',
  '家居',
  '汽车',
  '金融',
] as const;

@Controller('users/industry-preferences')
export class IndustryController {
  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 获取当前用户的行业偏好
   * @returns { industries: string[] }
   */
  @Get()
  async getPreferences(
    @CurrentUser('userId') userId: string,
  ): Promise<{ industries: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw BusinessException.notFound('用户');
    }
    return { industries: user.industryPreferences ?? [] };
  }

  /**
   * 设置行业偏好（覆盖更新）
   * @param dto { industries: string[] } (1-3 个)
   * @returns { industries: string[] } 更新后的行业偏好
   */
  @Post()
  async setPreferences(
    @CurrentUser('userId') userId: string,
    @Body() dto: IndustryPreferenceDto,
  ): Promise<{ industries: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw BusinessException.notFound('用户');
    }

    user.industryPreferences = dto.industries;
    await this.userRepo.save(user);

    return { industries: user.industryPreferences };
  }
}
