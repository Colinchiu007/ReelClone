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
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { WorkStatus } from '@reelclone/database'

export class ListWorksDto {
  @IsEnum(WorkStatus)
  @IsOptional()
  status?: WorkStatus

  @IsString()
  @IsOptional()
  userId?: string

  @IsDateString()
  @IsOptional()
  startDate?: string

  @IsDateString()
  @IsOptional()
  endDate?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 20
}
