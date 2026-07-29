import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 结算冻结积分 DTO（内部 API）
 *
 * 业务场景：任务成功完成后，按实际用量结算冻结的积分。
 * 逻辑：扣减冻结积分（frozen -= amount），可用余额不变（已在 FREEZE 时扣减），记入消费流水。
 */
export class SettlePointsDto {
  /** 用户 ID */
  @IsString()
  userId!: string;

  /** 结算数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number;

  /** 幂等键 */
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  /** 关联作品 ID（可选） */
  @IsOptional()
  @IsString()
  workId?: string;

  /** 关联的 FREEZE 流水 ID（必传，定位原冻结记录） */
  @IsString()
  freezeId!: string;

  /** 业务说明（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}
