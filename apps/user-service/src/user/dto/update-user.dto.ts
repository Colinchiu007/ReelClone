/**
 * 更新用户信息 DTO
 * 用于 PUT /api/v1/users/me
 */
import { IsOptional, IsString, IsArray, MaxLength, IsEmail } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class UpdateUserDto {
  /** 昵称 */
  @ApiProperty({
    description: '用户昵称',
    example: '张三',
    required: false,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  /** 头像 URL */
  @ApiProperty({
    description: '用户头像 URL',
    example: 'https://thirdwx.qlogo.cn/mmopen/abc123/132',
    required: false,
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string

  /** 邮箱 */
  @ApiProperty({
    description: '用户邮箱',
    example: 'zhangsan@example.com',
    required: false,
    maxLength: 128,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(128)
  email?: string

  /** 行业偏好标签列表 */
  @ApiProperty({
    description: '行业偏好标签列表',
    example: ['互联网', '教育'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  industryPreferences?: string[]
}
