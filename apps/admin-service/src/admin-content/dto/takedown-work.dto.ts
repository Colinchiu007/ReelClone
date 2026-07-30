/**
 * 强制下架作品 DTO
 *
 * 对应 DELETE /api/v1/admin/works/:id
 * 字段说明：
 *  - reason: 下架原因（必填，1-500 字符）
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'

export class TakedownWorkDto {
  @ApiProperty({
    description: '下架原因（必填，1-500 字符）',
    example: '内容违规',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string
}
