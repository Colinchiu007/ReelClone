import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'

/**
 * 奖励积分 DTO（内部 API）
 *
 * 业务场景：用户上传的视频被他人作为模板使用时，奖励上传者积分。
 * 逻辑：可用余额 += amount，累计积分 += amount，记入 REWARD 流水并关联 templateId。
 */
export class RewardPointsDto {
  /** 用户 ID（被奖励的上传者） */
  @IsUUID()
  userId!: string

  /** 奖励数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number

  /** 触发奖励的模板 ID（写入流水 templateId 字段） */
  @IsString()
  templateId!: string

  /** 幂等键（必传，重复请求返回首次结果） */
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string

  /** 业务说明（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string
}
