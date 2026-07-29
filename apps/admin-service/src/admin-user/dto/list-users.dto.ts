/**
 * 用户列表查询 DTO
 *
 * 支持按 keyword（昵称/手机号模糊搜索）、status、role 筛选 + 分页。
 */
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { UserRole, UserStatus } from '@reelclone/database'

export class ListUsersDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  /** 每页条数 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 搜索关键字（昵称 / 手机号模糊匹配） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  /** 用户状态筛选 */
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus

  /** 用户角色筛选 */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole
}
