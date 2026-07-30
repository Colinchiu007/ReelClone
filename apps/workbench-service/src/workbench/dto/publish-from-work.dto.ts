import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional, MaxLength, IsArray } from 'class-validator'

/**
 * 作品转模板 DTO
 *
 * 用户将已完成的视频作品转为模板时提交的数据。
 * work 层独立定义此 DTO（不依赖 template-service 的 DTO），通过 HTTP client 调用 template-service。
 */
export class PublishFromWorkDto {
  /** 模板标题 */
  @ApiProperty({
    description: '模板标题（最多 128 字符）',
    example: '夏日饮品推广短视频模板',
    maxLength: 128,
  })
  @IsString()
  @MaxLength(128)
  title!: string

  /** 详细描述 */
  @ApiProperty({
    description: '详细描述（最多 2000 字符）',
    example: '适用于饮品/快消品推广，含品牌 LOGO 占位与字幕样式',
    required: false,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  /** 分类 */
  @ApiProperty({
    description: '分类（最多 64 字符）',
    example: '营销推广',
    required: false,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string

  /** 适用行业 */
  @ApiProperty({
    description: '适用行业（最多 64 字符）',
    example: '餐饮/快消',
    required: false,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  industry?: string

  /** 适用平台 */
  @ApiProperty({
    description: '适用平台（最多 32 字符，如 douyin/wechat/xhs）',
    example: 'douyin',
    required: false,
    maxLength: 32,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string

  /** 标签数组 */
  @ApiProperty({
    description: '标签数组',
    example: ['夏日', '饮品', '推广'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]
}
