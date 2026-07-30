import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 赠送积分 DTO（内部 API）
 *
 * 业务场景：套餐购买支付成功后，由订单服务调用，给用户增加积分。
 * 逻辑：可用余额 += amount，累计积分 += amount，记入 RECHARGE/GRANT 流水。
 */
export class GrantPointsDto {
  /** 用户 ID */
  @ApiProperty({
    description: '用户 ID',
    example: 'user-uuid-001',
  })
  @IsString()
  userId!: string

  /** 赠送数量（>0） */
  @ApiProperty({
    description: '赠送数量（>0）',
    example: 500,
  })
  @IsInt()
  @Min(1)
  amount!: number

  /** 幂等键 */
  @ApiProperty({
    description: '幂等键',
    example: 'grant-20260731-001',
  })
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string

  /** 关联订单 ID */
  @ApiProperty({
    description: '关联订单 ID',
    example: 'order-uuid-001',
  })
  @IsString()
  orderId!: string

  /** 关联套餐 ID */
  @ApiProperty({
    description: '关联套餐 ID',
    example: 'package-uuid-001',
  })
  @IsString()
  packageId!: string

  /** 业务说明（可选） */
  @ApiProperty({
    description: '业务说明（可选）',
    example: '套餐购买赠送积分',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string
}
