/**
 * 修改密码 DTO
 * 用于 PUT /api/v1/users/password
 *
 * 逻辑：
 * - 如果用户已设置密码（user.password 不为 null），用 oldPassword 验证
 * - 否则用短信验证码验证（code + mobile）
 */
import { IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ChangePasswordDto {
  /** 旧密码（用户已设置密码时必填） */
  @ApiProperty({
    description: '旧密码（用户已设置密码时必填）',
    example: 'OldPass@1234',
    required: false,
    minLength: 8,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  oldPassword?: string

  /** 新密码（8-64 位） */
  @ApiProperty({
    description: '新密码（8-64 位）',
    example: 'NewPass@1234',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  newPassword: string

  /** 短信验证码（用户未设置密码时必填） */
  @ApiProperty({
    description: '短信验证码（用户未设置密码时必填）',
    example: '123456',
    required: false,
  })
  @IsOptional()
  @IsString()
  code?: string

  /** 手机号（配合短信验证码使用） */
  @ApiProperty({
    description: '手机号（配合短信验证码使用，中国大陆 11 位）',
    example: '13800138000',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  mobile?: string
}
