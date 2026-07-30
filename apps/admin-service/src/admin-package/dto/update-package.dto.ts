/**
 * 编辑套餐 DTO
 *
 * PUT /api/v1/admin/packages/:id
 *
 * 所有字段均为可选，仅更新传入的字段。
 * 注意：status 不在此 DTO 中开放，需通过 /:id/status 接口流转。
 */
import { ApiProperty } from '@nestjs/swagger'
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
  @ApiProperty({
    description: '套餐名称（最多 64 字符，可选）',
    example: '基础套餐',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string

  /** 描述 */
  @ApiProperty({
    description: '套餐描述（可选）',
    example: '适合个人创作者的基础套餐',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string

  /** 价格（元） */
  @ApiProperty({
    description: '价格（元，最多两位小数，可选）',
    example: 9.9,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number

  /** 原价（元） */
  @ApiProperty({
    description: '原价（元，最多两位小数，可选）',
    example: 19.9,
    required: false,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalPrice?: number

  /** 包含积分数量 */
  @ApiProperty({
    description: '包含积分数量（可选）',
    example: 1000,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  points?: number

  /** 赠送积分数量 */
  @ApiProperty({
    description: '赠送积分数量（可选）',
    example: 200,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusPoints?: number

  /** 有效期（天） */
  @ApiProperty({
    description: '有效期（天，可选）',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number

  /** 功能特性（JSON 数组） */
  @ApiProperty({
    description: '功能特性（JSON 字符串数组，可选）',
    example: ['高清导出', '无水印'],
    required: false,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[]

  /** 套餐类型 */
  @ApiProperty({
    description: '套餐类型（SUBSCRIPTION 订阅 / ONE_TIME 一次性，可选）',
    example: 'ONE_TIME',
    required: false,
    enum: PackageType,
  })
  @IsOptional()
  @IsEnum(PackageType)
  type?: PackageType

  /** 排序值 */
  @ApiProperty({
    description: '排序值（可选，值越小越靠前）',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort?: number
}
