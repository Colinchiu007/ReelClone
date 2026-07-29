/**
 * 编辑套餐 DTO
 *
 * PUT /api/v1/admin/packages/:id
 *
 * 所有字段均为可选，仅更新传入的字段。
 * 注意：status 不在此 DTO 中开放，需通过 /:id/status 接口流转。
 */
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'
import { PackageType } from '@reelclone/database'

/**
 * 编辑套餐 DTO
 */
export class UpdatePackageDto {
  /** 套餐名称 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  /** 描述 */
  @IsOptional()
  @IsString()
  description?: string

  /** 价格（元） */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number

  /** 原价（元） */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalPrice?: number

  /** 包含积分数量 */
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number

  /** 赠送积分数量 */
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusPoints?: number

  /** 有效期（天） */
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number

  /** 功能特性（JSON 数组） */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[]

  /** 套餐类型 */
  @IsOptional()
  @IsEnum(PackageType)
  type?: PackageType

  /** 排序值 */
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number
}
