/**
 * 积分流水查询 DTO
 *
 * Query: userId? / startDate? / endDate? / page / pageSize
 *
 * 从 billing 库 point_transactions 表查询，支持按用户与时间范围筛选 + 分页。
 */
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class PointsFlowQueryDto {
  /** 页码，默认 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  /** 每页条数，默认 20，最大 100 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 用户 ID 筛选（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string

  /** 起始时间（可选，ISO 8601）—— 筛选 createdAt >= startDate */
  @IsOptional()
  @IsDateString()
  startDate?: string

  /** 结束时间（可选，ISO 8601）—— 筛选 createdAt <= endDate */
  @IsOptional()
  @IsDateString()
  endDate?: string
}
