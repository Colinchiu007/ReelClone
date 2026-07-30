/**
 * 发送短信验证码 DTO
 * 用于 POST /api/v1/sms/send
 *
 * 注意：SmsCodePurpose 枚举值为 BIND_MOBILE | RESET_PASSWORD
 * （RESET_PASSWORD 用于修改密码场景）
 */
import { IsEnum, IsString, Matches } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { SmsCodePurpose } from '@reelclone/database'

export class SendSmsDto {
  /** 手机号（中国大陆 11 位） */
  @ApiProperty({
    description: '手机号（中国大陆 11 位）',
    example: '13800138000',
  })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  mobile: string

  /** 验证码用途 */
  @ApiProperty({
    description: '验证码用途（BIND_MOBILE 绑定手机号 / RESET_PASSWORD 重置密码）',
    example: 'BIND_MOBILE',
    enum: SmsCodePurpose,
  })
  @IsEnum(SmsCodePurpose)
  purpose: SmsCodePurpose
}
