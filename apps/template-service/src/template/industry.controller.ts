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
import { Controller, Get, Post, Body } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@reelclone/common'
import { IndustryPreferenceDto } from './dto/industry-preference.dto'
import { IndustryService } from './industry.service'

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
] as const

@ApiTags('template-industry')
@Controller('users/industry-preferences')
export class IndustryController {
  constructor(private readonly industryService: IndustryService) {}

  /**
   * 获取当前用户的行业偏好
   * @returns { industries: string[] }
   */
  @Get()
  @ApiOperation({ summary: '获取当前用户的行业偏好' })
  async getPreferences(@CurrentUser('userId') userId: string): Promise<{ industries: string[] }> {
    return this.industryService.getPreferences(userId)
  }

  /**
   * 设置行业偏好（覆盖更新）
   * @param dto { industries: string[] } (1-3 个)
   * @returns { industries: string[] } 更新后的行业偏好
   */
  @Post()
  @ApiOperation({ summary: '设置行业偏好' })
  async setPreferences(
    @CurrentUser('userId') userId: string,
    @Body() dto: IndustryPreferenceDto,
  ): Promise<{ industries: string[] }> {
    return this.industryService.setPreferences(userId, dto.industries)
  }
}
