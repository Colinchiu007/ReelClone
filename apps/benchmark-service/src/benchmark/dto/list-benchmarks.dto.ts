import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { BenchmarkPlatform, BenchmarkStatus } from '@reelclone/database'

/**
 * 查询对标解析历史 DTO
 *
 * Query: page, pageSize, platform?, status?
 */
export class ListBenchmarksDto {
  /** 页码，从 1 开始 */
  @ApiProperty({
    description: '页码，从 1 开始',
    example: 1,
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  /** 每页条数 */
  @ApiProperty({
    description: '每页条数（1-100）',
    example: 20,
    required: false,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20

  /** 平台筛选 */
  @ApiProperty({
    description: '平台筛选（DOUYIN/XIAOHONGSHU/BILIBILI/KUAISHOU/WEIBO/WECHAT_VIDEO）',
    example: 'DOUYIN',
    required: false,
    enum: BenchmarkPlatform,
  })
  @IsOptional()
  @IsEnum(BenchmarkPlatform)
  platform?: BenchmarkPlatform

  /** 状态筛选 */
  @ApiProperty({
    description: '状态筛选（PENDING/DOWNLOADING/ANALYZING/COMPLETED/FAILED/CANCELLED）',
    example: 'COMPLETED',
    required: false,
    enum: BenchmarkStatus,
  })
  @IsOptional()
  @IsEnum(BenchmarkStatus)
  status?: BenchmarkStatus
}
