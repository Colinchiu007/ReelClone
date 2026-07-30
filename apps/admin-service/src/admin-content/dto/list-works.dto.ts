/**
 * 作品列表查询 DTO
 *
 * 对应 GET /api/v1/admin/works
 * 字段说明：
 *  - status:     可选，按作品状态筛选
 *  - userId:     可选，按创作者 ID 筛选
 *  - startDate:  可选，创建时间下界（ISO 8601 日期字符串）
 *  - endDate:    可选，创建时间上界（ISO 8601 日期字符串）
 *  - page:       页码，1 基，默认 1
 *  - pageSize:   每页条数，默认 20，最大 100
 */
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { WorkStatus } from '@reelclone/database'

export class ListWorksDto {
  @ApiProperty({
    description: '作品状态筛选（可选）',
    example: 'COMPLETED',
    required: false,
    enum: WorkStatus,
  })
  @IsEnum(WorkStatus)
  @IsOptional()
  status?: WorkStatus

  @ApiProperty({
    description: '创作者 ID 筛选（可选）',
    example: 'user-uuid-001',
    required: false,
  })
  @IsString()
  @IsOptional()
  userId?: string

  @ApiProperty({
    description: '创建时间下界（可选，ISO 8601）',
    example: '2025-01-01T00:00:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  startDate?: string

  @ApiProperty({
    description: '创建时间上界（可选，ISO 8601）',
    example: '2025-12-31T23:59:59Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  endDate?: string

  @ApiProperty({
    description: '页码，1 基，默认 1',
    example: 1,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1

  @ApiProperty({
    description: '每页条数，默认 20，最大 100',
    example: 20,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 20
}
