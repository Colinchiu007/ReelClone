/**
 * 订单列表查询 DTO（管理后台）
 *
 * Query: page, pageSize, status?, userId?, startDate?, endDate?
 *
 * 支持按状态、用户、创建时间范围筛选 + 分页，全平台订单可见（管理后台）。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { OrderStatus } from '@reelclone/database'

export class ListOrdersDto {
  /** 页码，默认 1 */
  @ApiProperty({
    description: '页码，默认 1',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1

  /** 每页条数，默认 20，最大 100 */
  @ApiProperty({
    description: '每页条数，默认 20，最大 100',
    example: 20,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20

  /** 订单状态筛选（可选） */
  @ApiProperty({
    description: '订单状态筛选（可选）',
    example: 'PAID',
    required: false,
    enum: OrderStatus,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  /** 用户 ID 筛选（可选） */
  @ApiProperty({
    description: '用户 ID 筛选（可选）',
    example: 'user-uuid-001',
    required: false,
  })
  @IsOptional()
  @IsString()
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
