import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * 提交对标解析任务 DTO
 *
 * 请求体：{ sourceUrl: string, idempotencyKey?: string }
 * - sourceUrl: 对标视频链接（抖音/小红书/B站/快手/微博/视频号）
 * - idempotencyKey: 幂等键（可选，未提供时由服务端生成）
 */
export class CreateBenchmarkDto {
  /** 对标视频链接 */
  @ApiProperty({
    description: '对标视频链接（支持抖音/小红书/B站/快手/微博/视频号）',
    example: 'https://www.douyin.com/video/7234567890123456789',
    maxLength: 1024,
  })
  @IsString()
  @MaxLength(1024)
  sourceUrl!: string

  /** 幂等键（可选） */
  @ApiProperty({
    description: '幂等键（可选，未提供时由服务端生成）',
    example: 'bench-7f3c2a1b-9e8d-4c2a',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string
}
