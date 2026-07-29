/**
 * 强制下架作品 DTO
 *
 * 对应 DELETE /api/v1/admin/works/:id
 * 字段说明：
 *  - reason: 下架原因（必填，1-500 字符）
 */
import { IsString, MaxLength, MinLength } from 'class-validator'

export class TakedownWorkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}
