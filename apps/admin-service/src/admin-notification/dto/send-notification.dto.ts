/**
 * 定向推送 DTO
 *
 * body: { userId, title, content }
 * 推送给指定单个用户。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class SendNotificationDto {
  /** 接收用户 ID */
  @ApiProperty({
    description: '接收用户 ID',
    example: 'user-uuid-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string

  /** 通知标题 */
  @ApiProperty({
    description: '通知标题（最多 128 字符）',
    example: '充值成功通知',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string

  /** 通知内容 */
  @ApiProperty({
    description: '通知内容（最多 4000 字符）',
    example: '您充值 100 元已到账，获得 1000 积分。',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string
}
