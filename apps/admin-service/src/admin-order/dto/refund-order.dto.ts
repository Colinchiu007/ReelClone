/**
 * 退款 DTO
 *
 * 请求体: { reason: string }
 */
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class RefundOrderDto {
  /** 退款原因（必填，1-500 字符，用于审计日志） */
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  reason!: string
}
