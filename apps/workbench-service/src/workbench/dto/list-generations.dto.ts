import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { GenerationType } from './create-generation.dto'

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
  @ApiProperty({
    description: '页码，从 1 开始',
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  /** 每页条数 */
  @ApiProperty({
    description: '每页条数（1-100）',
    example: 20,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 任务状态筛选 */
  @ApiProperty({
    description: '任务状态筛选（PENDING/RUNNING/COMPLETED/FAILED）',
    example: TaskStatusFilter.COMPLETED,
    enum: TaskStatusFilter,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskStatusFilter)
  status?: TaskStatusFilter

  /** 生成类型筛选 */
  @ApiProperty({
    description: '生成类型筛选（文生视频/图生视频/3D 建模等）',
    example: GenerationType.TEXT_TO_VIDEO,
    enum: GenerationType,
    required: false,
  })
  @IsOptional()
  @IsEnum(GenerationType)
  generationType?: GenerationType
}
