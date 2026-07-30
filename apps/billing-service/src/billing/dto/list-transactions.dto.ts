import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { PointTransactionType } from '@reelclone/database'

/**
 * 流水方向（按 amount 正负判断）
 *  - DEBIT: 扣减（amount < 0）
 *  - CREDIT: 增加（amount > 0）
 */
export enum TransactionDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * 积分流水查询 DTO
 *
 * 支持按类型、方向、时间范围筛选 + 分页。
 */
export class ListTransactionsDto {
  /** 页码，从 1 开始 */
  @ApiProperty({
    description: '页码，从 1 开始',
    example: 1,
    required: false,
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
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 流水类型 */
  @ApiProperty({
    description: '流水类型（FREEZE/SETTLE/RELEASE/GRANT/CONSUME/REWARD）',
    example: PointTransactionType.FREEZE,
    enum: PointTransactionType,
    required: false,
  })
  @IsOptional()
  @IsEnum(PointTransactionType)
  type?: PointTransactionType

  /** 流水方向 */
  @ApiProperty({
    description: '流水方向（DEBIT=扣减，CREDIT=增加）',
    example: TransactionDirection.DEBIT,
    enum: TransactionDirection,
    required: false,
  })
  @IsOptional()
  @IsEnum(TransactionDirection)
  direction?: TransactionDirection

  /** 起始时间（ISO 8601） */
  @ApiProperty({
    description: '起始时间（ISO 8601）',
    example: '2026-01-01T00:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  startTime?: string

  /** 截止时间（ISO 8601） */
  @ApiProperty({
    description: '截止时间（ISO 8601）',
    example: '2026-07-31T23:59:59Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endTime?: string
}

/**
 * 单笔流水详情查询 DTO
 */
export class GetTransactionDto {
  @ApiProperty({
    description: '流水记录 ID',
    example: 'txn-uuid-001',
  })
  @IsString()
  id!: string
}
