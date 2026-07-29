/**
 * 用户状态更新 DTO
 *
 * 用于封禁 / 解封用户，仅允许 ACTIVE / FROZEN 两种状态。
 */
import { IsEnum } from 'class-validator'
import { UserStatus } from '@reelclone/database'

export class UpdateUserStatusDto {
  /** 目标状态（ACTIVE / FROZEN） */
  @IsEnum(UserStatus)
  status: UserStatus
}
