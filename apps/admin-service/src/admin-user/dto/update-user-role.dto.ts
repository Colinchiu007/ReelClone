/**
 * 用户角色更新 DTO
 *
 * 用于变更用户角色，仅 SUPER_ADMIN 可操作。
 */
import { IsEnum } from 'class-validator'
import { UserRole } from '@reelclone/database'

export class UpdateUserRoleDto {
  /** 目标角色（USER / ADMIN / SUPER_ADMIN） */
  @IsEnum(UserRole)
  role: UserRole
}
