import { IsMobilePhone, IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/** 管理员登录 DTO */
export class AdminLoginDto {
  /** 手机号（作为管理员账号） */
  @ApiProperty({
    description: '手机号（作为管理员账号）',
    example: '13800138000',
  })
  @IsMobilePhone('zh-CN')
  mobile: string

  /** 密码 */
  @ApiProperty({
    description: '密码（至少 6 位）',
    example: 'secret123',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string
}
