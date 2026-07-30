/**
 * 绑定手机号 DTO
 * 用于 POST /api/v1/users/bind-mobile
 */
import { IsString, Matches, Length } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class BindMobileDto {
  /** 手机号（中国大陆 11 位） */
  @ApiProperty({
    description: '手机号（中国大陆 11 位）',
    example: '13800138000',
  })
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  mobile: string

  /** 短信验证码（6 位数字） */
  @ApiProperty({
    description: '短信验证码（6-8 位数字）',
    example: '123456',
    minLength: 6,
    maxLength: 8,
  })
  @IsString()
  @Length(6, 8)
  code: string
}
