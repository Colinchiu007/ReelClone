/**
 * 定向推送 DTO
 *
 * body: { userId, title, content }
 * 推送给指定单个用户。
 */
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class SendNotificationDto {
  /** 接收用户 ID */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  userId: string

  /** 通知标题 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string

  /** 通知内容 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string
}
