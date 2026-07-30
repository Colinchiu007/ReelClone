/**
 * 积分流水查询 DTO
 *
 * Query: userId? / startDate? / endDate? / page / pageSize
 *
 * 从 billing 库 point_transactions 表查询，支持按用户与时间范围筛选 + 分页。
 */
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class PointsFlowQueryDto {
  /** 页码，默认 1 */
  @ApiProperty({
    description: '页码，默认 1',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  /** 每页条数，默认 20，最大 100 */
  @ApiProperty({
    description: '每页条数，默认 20，最大 100',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 用户 ID 筛选（可选） */
  @ApiProperty({
    description: '用户 ID 筛选（可选）',
    example: 'user-uuid-001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string

  /** 起始时间（可选，ISO 8601）—— 筛选 createdAt >= startDate */
  @ApiProperty({
    description: '起始时间（可选，ISO 8601），筛选 createdAt >= startDate',
    example: '2025-01-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startDate?: string

  /** 结束时间（可选，ISO 8601）—— 筛选 createdAt <= endDate */
  @ApiProperty({
    description: '结束时间（可选，ISO 8601），筛选 createdAt <= endDate',
    example: '2025-12-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string
}
