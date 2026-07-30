import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 用户上传视频转模板 DTO
 *
 * 用户通过小程序上传视频后，提交转模板请求。
 * assetId 必须为已上传到 asset-service 的视频资产 ID。
 * 提交后模板状态为 ANALYZING，Temporal 工作流异步分析视频并生成模板。
 */
export class UploadTemplateDto {
  /** 已上传的视频资产 ID（asset-service 登记） */
  @ApiProperty({
    description: '已上传的视频资产 ID（asset-service 登记）',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  assetId!: string

  /** 模板标题 */
  @ApiProperty({
    description: '模板标题',
    example: '好物开箱三连',
  })
  @IsString()
  @MaxLength(128)
  title!: string

  /** 模板详细描述 */
  @ApiProperty({
    description: '模板详细描述',
    example: '适用于新品开箱展示，节奏明快，三段式结构。',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

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

  /** 适用平台 DOUYIN / XIAOHONGSHU / ... */
  @ApiProperty({
    description: '适用平台 DOUYIN / XIAOHONGSHU / ...',
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
}
