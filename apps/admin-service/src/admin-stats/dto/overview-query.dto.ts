/**
 * 概览查询 DTO
 *
 * Query: range
 *  - '7d'  最近 7 天（默认）
 *  - '30d' 最近 30 天
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional } from 'class-validator'

/** 概览时间范围 */
export type OverviewRange = '7d' | '30d'

export class OverviewQueryDto {
  /** 时间范围，默认 7d */
  @ApiProperty({
    description: '时间范围（7d 最近 7 天 / 30d 最近 30 天），默认 7d',
    example: '7d',
    required: false,
    enum: ['7d', '30d'],
  })
  @IsOptional()
  @IsEnum(['7d', '30d'])
  range?: OverviewRange = '7d'
}
