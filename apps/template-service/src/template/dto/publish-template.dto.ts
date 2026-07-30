import { IsString, IsOptional, MaxLength, IsArray } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 发布模板 DTO（用户 UGC 上传）
 *
 * 用于用户将作品转为模板时提交的数据。
 * 提交后状态为 PENDING_REVIEW，待运营审核。
 */
export class PublishTemplateDto {
  /** 模板标题 */
  @ApiProperty({
    description: '模板标题',
    example: '好物开箱三连',
  })
  @IsString()
  @MaxLength(128)
  title!: string

  /** 详细描述 */
  @ApiProperty({
    description: '详细描述',
    example: '适用于新品开箱展示，节奏明快，三段式结构。',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  /** 提示词（来自作品的 prompt） */
  @ApiProperty({
    description: '提示词（来自作品的 prompt）',
    example: '一只手拿起产品展示细节，镜头特写切换',
  })
  @IsString()
  prompt!: string

  /** 封面 OSS Key（来自作品缩略图） */
  @ApiProperty({
    description: '封面 OSS Key（来自作品缩略图）',
    example: 'thumbnails/work/20260731-cover.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  coverKey?: string

  /** 视频 OSS Key（来自作品结果） */
  @ApiProperty({
    description: '视频 OSS Key（来自作品结果）',
    example: 'videos/work/20260731-result.mp4',
    required: false,
  })
  @IsOptional()
  @IsString()
  videoKey?: string

  /** 分类 */
  @ApiProperty({
    description: '分类',
    example: '开箱',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string

  /** 适用行业 */
  @ApiProperty({
    description: '适用行业',
    example: '好物种草',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  industry?: string

  /** 适用平台 */
  @ApiProperty({
    description: '适用平台',
    example: 'DOUYIN',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string

  /** 标签数组 */
  @ApiProperty({
    description: '标签数组',
    example: ['开箱', '新品', '种草'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  /** 来源作品 ID */
  @ApiProperty({
    description: '来源作品 ID',
    example: 'a1b2c3d4-uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  sourceWorkId?: string
}
