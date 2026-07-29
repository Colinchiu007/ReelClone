/**
 * 创建套餐 DTO
 *
 * POST /api/v1/admin/packages
 *
 * 字段对齐 Package 实体（libs/database）：
 *   name / description / price / originalPrice / points / bonusPoints
 *   duration / features / type / sort
 *
 * 注意：status 不在此 DTO 中开放，创建后默认 OFFLINE，需通过状态接口手动上架。
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
 * 创建套餐 DTO
 */
export class CreatePackageDto {
  /** 套餐名称 */
  @IsString()
  @MaxLength(64)
  name: string

  /** 描述 */
  @IsOptional()
  @IsString()
  description?: string

  /** 价格（元） */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number

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
  @IsEnum(PackageType)
  type: PackageType

  /** 排序值 */
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number
}
