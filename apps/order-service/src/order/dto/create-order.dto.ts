/**
 * 创建订单 DTO
 *
 * 请求体: { packageId: string, idempotencyKey?: string }
 */
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrderDto {
  /** 套餐 ID */
  @IsString()
  @MinLength(1)
  packageId!: string;

  /** 幂等键（可选，未提供时由服务端自动生成） */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
