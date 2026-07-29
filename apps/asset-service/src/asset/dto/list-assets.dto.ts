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
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '@reelclone/common';
import { AssetType } from '@reelclone/database';

export class ListAssetsDto extends PaginationDto {
  /** 页码，从 1 开始 */
  @IsOptional()
  @IsInt()
  @Min(1)
  declare page: number;

  /** 每页条数，1-100 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  declare pageSize: number;

  /** 资产类型筛选 */
  @IsOptional()
  @IsEnum(AssetType)
  type?: AssetType;

  /** 真人形象组筛选（查询组内资产） */
  @IsOptional()
  @IsString()
  avatarGroupId?: string;

  /** 文件名关键词（模糊匹配） */
  @IsOptional()
  @IsString()
  keyword?: string;
}
