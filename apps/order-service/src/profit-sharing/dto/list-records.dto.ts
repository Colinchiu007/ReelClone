import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { ProfitSharingStatus } from '@reelclone/database'

/**
 * 分账记录列表查询 DTO
 */
export class ListRecordsDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number

  @ApiPropertyOptional({ enum: ProfitSharingStatus, description: '分账状态筛选' })
  @IsEnum(ProfitSharingStatus)
  @IsOptional()
  status?: ProfitSharingStatus

  @ApiPropertyOptional({ description: '订单号筛选' })
  @IsString()
  @IsOptional()
  orderNo?: string
}
