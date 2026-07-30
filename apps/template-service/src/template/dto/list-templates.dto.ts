/**
 * 模板列表查询 DTO
 *
 * 支持分页 + 多维度筛选 + 排序。
 * 继承 PaginationDto 获取 page / pageSize 字段。
 */
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { PaginationDto } from '@reelclone/common'

/** 排序方式 */
export type SortBy = 'heat' | 'latest' | 'iq'

/** 平台枚举 */
export enum Platform {
  DOUYIN = 'DOUYIN',
  XIAOHONGSHU = 'XIAOHONGSHU',
  BILIBILI = 'BILIBILI',
  WECHAT_VIDEO = 'WECHAT_VIDEO',
  KUAISHOU = 'KUAISHOU',
}

/**
 * 模板列表查询参数
 */
export class ListTemplatesDto extends PaginationDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @IsInt()
  @Min(1)
  declare page: number

  /** 每页条数，1-100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  declare pageSize: number

  /** 平台筛选 */
  @ApiProperty({
    description: '平台筛选（DOUYIN/XIAOHONGSHU/BILIBILI/WECHAT_VIDEO/KUAISHOU）',
    example: 'DOUYIN',
    required: false,
  })
  @IsOptional()
  @IsString()
  platform?: string

  /** 行业筛选 */
  @ApiProperty({
    description: '行业筛选',
    example: '好物种草',
    required: false,
  })
  @IsOptional()
  @IsString()
  industry?: string

  /** 关键词（标题模糊匹配） */
  @ApiProperty({
    description: '关键词（标题模糊匹配）',
    example: '开箱',
    required: false,
  })
  @IsOptional()
  @IsString()
  keyword?: string

  /** 排序方式: heat(综合热度) / latest(创建时间) / iq(iqScore) */
  @ApiProperty({
    description: '排序方式: heat(综合热度) / latest(创建时间) / iq(iqScore)',
    example: 'heat',
    required: false,
    enum: ['heat', 'latest', 'iq'],
  })
  @IsOptional()
  @IsIn(['heat', 'latest', 'iq'])
  sortBy: SortBy = 'heat'
}
