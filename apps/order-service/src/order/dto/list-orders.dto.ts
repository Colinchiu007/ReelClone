/**
 * 订单列表查询 DTO
 *
 * Query: page, pageSize, status?
 */
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { OrderStatus } from '@reelclone/database';

export class ListOrdersDto {
  /** 页码，默认 1 */
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** 每页条数，默认 20，最大 100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  /** 订单状态筛选（可选） */
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
