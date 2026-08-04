import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { AssetStatus } from '@reelclone/database'

/**
 * 资产审核 DTO
 *
 * 运营在审核工作台对用户上传的资产进行审核。
 * status=ACTIVE 表示审核通过，status=REJECTED 表示拒绝。
 */
export class ReviewAssetDto {
  /** 审核后状态（仅允许 ACTIVE 或 REJECTED） */
  @ApiProperty({
    description: '审核后状态（ACTIVE 审核通过 / REJECTED 拒绝）',
    example: 'ACTIVE',
    enum: [AssetStatus.ACTIVE, AssetStatus.REJECTED],
  })
  @IsIn([AssetStatus.ACTIVE, AssetStatus.REJECTED])
  status!: AssetStatus

  /** 审核备注 */
  @ApiProperty({
    description: '审核备注（可选）',
    example: '内容符合规范，审核通过',
    required: false,
  })
  @IsOptional()
  @IsString()
  reviewNote?: string
}
