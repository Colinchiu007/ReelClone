import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GenerationType } from './create-generation.dto';

/** 生成任务状态（查询用，对齐 GenerationTaskStatus） */
export enum TaskStatusFilter {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * 生成任务列表查询 DTO
 *
 * 支持按状态、类型筛选 + 分页。
 */
export class ListGenerationsDto {
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

  /** 任务状态筛选 */
  @IsOptional()
  @IsEnum(TaskStatusFilter)
  status?: TaskStatusFilter;

  /** 生成类型筛选 */
  @IsOptional()
  @IsEnum(GenerationType)
  generationType?: GenerationType;
}
