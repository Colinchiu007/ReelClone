/**
 * 订单列表查询 DTO（管理后台）
 *
 * Query: page, pageSize, status?, userId?, startDate?, endDate?
 *
 * 支持按状态、用户、创建时间范围筛选 + 分页，全平台订单可见（管理后台）。
 */
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { OrderStatus } from '@reelclone/database'

export class ListOrdersDto {
  /** 页码，默认 1 */
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1

  /** 每页条数，默认 20，最大 100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20

  /** 订单状态筛选（可选） */
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus

  /** 用户 ID 筛选（可选） */
  @IsOptional()
  @IsString()
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
