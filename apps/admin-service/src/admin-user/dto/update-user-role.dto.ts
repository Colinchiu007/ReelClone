/**
 * 用户角色更新 DTO
 *
 * 用于变更用户角色，仅 SUPER_ADMIN 可操作。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { UserRole } from '@reelclone/database'

export class UpdateUserRoleDto {
  /** 目标角色（USER / ADMIN / SUPER_ADMIN） */
  @ApiProperty({
    description: '目标角色（USER / ADMIN / SUPER_ADMIN）',
    example: 'ADMIN',
    enum: UserRole,
  })
  @IsEnum(UserRole)
  role: UserRole
}
