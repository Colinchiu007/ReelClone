/**
 * 模板列表查询 DTO
 *
 * 支持分页 + 多维度筛选 + 排序。
 * 继承 PaginationDto 获取 page / pageSize 字段。
 */
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { PaginationDto } from '@reelclone/common';

/** 排序方式 */
export type SortBy = 'heat' | 'latest' | 'iq';

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
  declare page: number;

  /** 每页条数，1-100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  declare pageSize: number;

  /** 平台筛选 */
  @IsOptional()
  @IsString()
  platform?: string;

  /** 行业筛选 */
  @IsOptional()
  @IsString()
  industry?: string;

  /** 关键词（标题模糊匹配） */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** 排序方式: heat(综合热度) / latest(创建时间) / iq(iqScore) */
  @IsOptional()
  @IsIn(['heat', 'latest', 'iq'])
  sortBy: SortBy = 'heat';
}
