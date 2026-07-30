/**
 * 创建订单 DTO
 *
 * 请求体: { packageId: string, idempotencyKey?: string }
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class CreateOrderDto {
  /** 套餐 ID */
  @ApiProperty({
    description: '套餐 ID',
    example: 'pkg_premium_monthly',
  })
  @IsString()
  @MinLength(1)
  packageId!: string

  /** 幂等键（可选，未提供时由服务端自动生成） */
  @ApiProperty({
    description: '幂等键（可选，未提供时由服务端自动生成）',
    example: 'a3f5b8c9-1d2e-3f4a-5b6c-7d8e9f0a1b2c',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string
}
