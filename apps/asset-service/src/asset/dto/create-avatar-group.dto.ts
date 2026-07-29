/**
 * 真人形象组 DTO
 *
 * - CreateAvatarGroupDto  : 创建形象组
 * - UpdateAvatarGroupDto  : 更新形象组（部分字段）
 * - ListAvatarGroupsDto   : 列表查询（分页）
 *
 * 字段名对齐 AvatarGroup 实体（libs/database）：
 *   name / description / authorizationKey / authorizationStatus / assetCount
 */
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { PaginationDto } from '@reelclone/common'

/**
 * 创建真人形象组 DTO
 * POST /api/v1/avatar-groups
 */
export class CreateAvatarGroupDto {
  /** 组名称（同用户下唯一） */
  @IsString()
  @MaxLength(64)
  name: string

  /** 描述 */
  @IsOptional()
  @IsString()
  description?: string

  /** 授权书 OSS Key（可后续补充） */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  authorizationKey?: string
}

/**
 * 更新真人形象组 DTO
 * PUT /api/v1/avatar-groups/:id
 *
 * 注意：authorizationStatus 不在此 DTO 中开放，
 * 用户不能自行修改授权状态，由管理员在 admin-service 审核端点流转。
 */
export class UpdateAvatarGroupDto {
  /** 组名称（若变更需重新校验唯一性） */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  /** 描述 */
  @IsOptional()
  @IsString()
  description?: string

  /** 授权书 OSS Key */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  authorizationKey?: string
}

/**
 * 真人形象组列表查询 DTO
 * GET /api/v1/avatar-groups
 */
export class ListAvatarGroupsDto extends PaginationDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @IsInt()
  @Min(1)
  declare page: number

  /** 每页条数，1-100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  declare pageSize: number
}
