/**
 * 资产列表查询 DTO
 *
 * 支持分页 + 多维度筛选：
 *  - type          资产类型（IMAGE / VIDEO / AUDIO）
 *  - avatarGroupId 限定某真人形象组下的资产
 *  - keyword       文件名模糊匹配（ILIKE）
 *
 * 继承 PaginationDto 获取 page / pageSize 字段。
 */
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { PaginationDto } from '@reelclone/common'
import { AssetType } from '@reelclone/database'

export class ListAssetsDto extends PaginationDto {
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

  /** 资产类型筛选 */
  @ApiProperty({
    description: '资产类型筛选（IMAGE/VIDEO/AUDIO）',
    example: AssetType.IMAGE,
    enum: AssetType,
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType

  /** 真人形象组筛选（查询组内资产） */
  @ApiProperty({
    description: '真人形象组筛选（查询组内资产）',
    example: 'a1b2c3d4-uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatarGroupId?: string

  /** 文件名关键词（模糊匹配） */
  @ApiProperty({
    description: '文件名关键词（模糊匹配）',
    example: 'avatar',
    required: false,
  })
  @IsOptional()
  @IsString()
  keyword?: string
}
