/**
 * 套餐状态更新 DTO
 *
 * PUT /api/v1/admin/packages/:id/status
 *
 * body: { status: 'ACTIVE' | 'OFFLINE' }
 *  - ACTIVE  上架（用户可见可购买）
 *  - OFFLINE 下架（用户不可见）
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'
import { PackageStatus } from '@reelclone/database'

/**
 * 套餐状态更新 DTO
 */
export class UpdatePackageStatusDto {
  /** 目标状态（ACTIVE 上架 / OFFLINE 下架） */
  @ApiProperty({
    description: '目标状态（ACTIVE 上架 / OFFLINE 下架）',
    example: 'ACTIVE',
    enum: PackageStatus,
  })
  @IsEnum(PackageStatus)
  status: PackageStatus
}
