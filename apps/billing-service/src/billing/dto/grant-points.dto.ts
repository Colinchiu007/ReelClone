import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 赠送积分 DTO（内部 API）
 *
 * 业务场景：套餐购买支付成功后，由订单服务调用，给用户增加积分。
 * 逻辑：可用余额 += amount，累计积分 += amount，记入 RECHARGE/GRANT 流水。
 */
export class GrantPointsDto {
  /** 用户 ID */
  @IsString()
  userId!: string;

  /** 赠送数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number;

  /** 幂等键 */
  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  /** 关联订单 ID */
  @IsString()
  orderId!: string;

  /** 关联套餐 ID */
  @IsString()
  packageId!: string;

  /** 业务说明（可选） */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  description?: string;
}
