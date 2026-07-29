import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WorkStatus, WorkType } from '@reelclone/database';

/**
 * 作品列表查询 DTO
 *
 * 支持按状态、类型筛选 + 分页。
 */
export class ListWorksDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /** 每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** 作品状态筛选 */
  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  /** 作品类型筛选 */
  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;
}
