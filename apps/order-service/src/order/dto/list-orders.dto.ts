/**
 * 订单列表查询 DTO
 *
 * Query: page, pageSize, status?
 */
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
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
    example: 'PENDING',
    required: false,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus
}
