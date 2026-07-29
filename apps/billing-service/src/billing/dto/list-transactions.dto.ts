import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PointTransactionType } from '@reelclone/database';

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

  /** 流水类型 */
  @IsOptional()
  @IsEnum(PointTransactionType)
  type?: PointTransactionType;

  /** 流水方向 */
  @IsOptional()
  @IsEnum(TransactionDirection)
  direction?: TransactionDirection;

  /** 起始时间（ISO 8601） */
  @IsOptional()
  @IsDateString()
  startTime?: string;

  /** 截止时间（ISO 8601） */
  @IsOptional()
  @IsDateString()
  endTime?: string;
}

/**
 * 单笔流水详情查询 DTO
 */
export class GetTransactionDto {
  @IsString()
  id!: string;
}
