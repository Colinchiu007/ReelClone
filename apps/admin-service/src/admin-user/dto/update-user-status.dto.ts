/**
 * 用户状态更新 DTO
 *
 * 用于封禁 / 解封用户，仅允许 ACTIVE / FROZEN 两种状态。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { UserStatus } from '@reelclone/database'

export class UpdateUserStatusDto {
  /** 目标状态（ACTIVE / FROZEN） */
  @ApiProperty({
    description: '目标状态（ACTIVE 正常 / FROZEN 封禁）',
    example: 'FROZEN',
    enum: UserStatus,
  })
  @IsEnum(UserStatus)
  status: UserStatus
}
