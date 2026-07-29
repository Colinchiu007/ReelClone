import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 释放冻结积分 DTO（内部 API）
 *
 * 业务场景：任务失败/取消时，将冻结的积分原路退回可用余额。
 * 逻辑：可用余额 += amount，冻结余额 -= amount，记入 RELEASE 流水。
 */
export class ReleasePointsDto {
  /** 用户 ID */
  @IsString()
  userId!: string;

  /** 释放数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number;

  /** 幂等键 */
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  /** 关联的 FREEZE 流水 ID（必传，定位原冻结记录） */
  @IsString()
  freezeId!: string;

  /** 业务说明（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}
