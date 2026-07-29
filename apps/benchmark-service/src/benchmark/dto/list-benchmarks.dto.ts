import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  BenchmarkPlatform,
  BenchmarkStatus,
} from '@reelclone/database';

/**
 * 查询对标解析历史 DTO
 *
 * Query: page, pageSize, platform?, status?
 */
export class ListBenchmarksDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** 每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** 平台筛选 */
  @IsOptional()
  @IsEnum(BenchmarkPlatform)
  platform?: BenchmarkPlatform;

  /** 状态筛选 */
  @IsOptional()
  @IsEnum(BenchmarkStatus)
  status?: BenchmarkStatus;
}
