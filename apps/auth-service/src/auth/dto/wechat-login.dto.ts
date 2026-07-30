/**
 * 微信小程序登录 DTO
 *
 * 前端 wx.login() 拿到 code 后调用 /api/v1/auth/wechat-login
 * 可选携带 nickname/avatarUrl（用于首次登录注册用户）
 */
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class WechatLoginDto {
  /** wx.login() 返回的临时登录凭证 code（5 分钟有效） */
  @ApiProperty({
    description: 'wx.login() 返回的临时登录凭证 code（5 分钟有效）',
    example: '081KxF000abcDEF123',
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty({ message: 'code 不能为空' })
  @MaxLength(256)
  code: string

  /** 用户昵称（首次注册时使用） */
  @ApiProperty({
    description: '用户昵称（首次注册时使用）',
    example: '张三',
    required: false,
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string

  /** 用户头像 URL（首次注册时使用） */
  @ApiProperty({
    description: '用户头像 URL（首次注册时使用）',
    example: 'https://thirdwx.qlogo.cn/...',
    required: false,
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string
}
