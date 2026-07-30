import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 奖励积分 DTO（内部 API）
 *
 * 业务场景：用户上传的视频被他人作为模板使用时，奖励上传者积分。
 * 逻辑：可用余额 += amount，累计积分 += amount，记入 REWARD 流水并关联 templateId。
 */
export class RewardPointsDto {
  /** 用户 ID（被奖励的上传者） */
  @ApiProperty({
    description: '用户 ID（被奖励的上传者）',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  userId!: string

  /** 奖励数量（>0） */
  @ApiProperty({
    description: '奖励数量（>0）',
    example: 10,
  })
  @IsInt()
  @Min(1)
  amount!: number

  /** 触发奖励的模板 ID（写入流水 templateId 字段） */
  @ApiProperty({
    description: '触发奖励的模板 ID（写入流水 templateId 字段）',
    example: 'template-uuid-001',
  })
  @IsString()
  templateId!: string

  /** 幂等键（必传，重复请求返回首次结果） */
  @ApiProperty({
    description: '幂等键（必传，重复请求返回首次结果）',
    example: 'reward-20260731-001',
  })
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string

  /** 业务说明（可选） */
  @ApiProperty({
    description: '业务说明（可选）',
    example: '模板被使用奖励上传者',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string
}
