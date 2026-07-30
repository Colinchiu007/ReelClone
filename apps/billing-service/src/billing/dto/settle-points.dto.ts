import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 结算冻结积分 DTO（内部 API）
 *
 * 业务场景：任务成功完成后，按实际用量结算冻结的积分。
 * 逻辑：扣减冻结积分（frozen -= amount），可用余额不变（已在 FREEZE 时扣减），记入消费流水。
 */
export class SettlePointsDto {
  /** 用户 ID */
  @ApiProperty({
    description: '用户 ID',
    example: 'user-uuid-001',
  })
  @IsString()
  userId!: string

  /** 结算数量（>0） */
  @ApiProperty({
    description: '结算数量（>0）',
    example: 80,
  })
  @IsInt()
  @Min(1)
  amount!: number

  /** 幂等键 */
  @ApiProperty({
    description: '幂等键',
    example: 'settle-20260731-001',
  })
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string

  /** 关联作品 ID（可选） */
  @ApiProperty({
    description: '关联作品 ID（可选）',
    example: 'work-uuid-001',
    required: false,
  })
  @IsOptional()
  @IsString()
  workId?: string

  /** 关联的 FREEZE 流水 ID（必传，定位原冻结记录） */
  @ApiProperty({
    description: '关联的 FREEZE 流水 ID（必传，定位原冻结记录）',
    example: 'txn-freeze-uuid-001',
  })
  @IsString()
  freezeId!: string

  /** 业务说明（可选） */
  @ApiProperty({
    description: '业务说明（可选）',
    example: '任务成功结算冻结积分',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string
}
