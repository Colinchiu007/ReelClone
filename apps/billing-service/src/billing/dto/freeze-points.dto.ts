import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 冻结积分 DTO（内部 API）
 *
 * 业务场景：用户提交生成任务时，预估扣减 N 积分，先冻结以避免并发超扣。
 * 失败响应：余额不足 → INSUFFICIENT_CREDITS (4001)
 */
export class FreezePointsDto {
  /** 用户 ID */
  @IsString()
  userId!: string;

  /** 冻结数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number;

  /** 幂等键（必传，重复请求返回首次结果） */
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  /** 关联作品 ID（可选） */
  @IsOptional()
  @IsString()
  workId?: string;

  /** 业务说明（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}
