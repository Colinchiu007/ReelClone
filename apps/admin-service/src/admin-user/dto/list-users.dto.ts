/**
 * 用户列表查询 DTO
 *
 * 支持按 keyword（昵称/手机号模糊搜索）、status、role 筛选 + 分页。
 */
import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { UserRole, UserStatus } from '@reelclone/database'

export class ListUsersDto {
  /** 页码，从 1 开始 */
  @ApiProperty({
    description: '页码，从 1 开始，默认 1',
    example: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  /** 每页条数 */
  @ApiProperty({
    description: '每页条数，默认 20，最大 100',
    example: 20,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20

  /** 搜索关键字（昵称 / 手机号模糊匹配） */
  @ApiProperty({
    description: '搜索关键字（昵称 / 手机号模糊匹配，最多 64 字符）',
    example: '张三',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string

  /** 用户状态筛选 */
  @ApiProperty({
    description: '用户状态筛选（ACTIVE / FROZEN）',
    example: 'ACTIVE',
    required: false,
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus

  /** 用户角色筛选 */
  @ApiProperty({
    description: '用户角色筛选（USER / ADMIN / SUPER_ADMIN）',
    example: 'USER',
    required: false,
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole
}
