/**
 * 退款 DTO
 *
 * 请求体: { reason: string }
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'

export class RefundOrderDto {
  /** 退款原因（必填，1-500 字符，用于审计日志） */
  @ApiProperty({
    description: '退款原因（必填，1-500 字符，用于审计日志）',
    example: '用户申请退款',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  reason!: string
}
