import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { AuthorizationStatus } from '@reelclone/database'

/**
 * 形象组授权审核 DTO
 *
 * 运营在审核工作台对真人形象组进行授权审核。
 * status=APPROVED 表示授权通过，status=EXPIRED 表示授权过期。
 */
export class ReviewAvatarGroupDto {
  /** 授权状态（仅允许 APPROVED 或 EXPIRED） */
  @ApiProperty({
    description: '授权状态（APPROVED 授权通过 / EXPIRED 授权过期）',
    example: 'APPROVED',
    enum: [AuthorizationStatus.APPROVED, AuthorizationStatus.EXPIRED],
  })
  @IsIn([AuthorizationStatus.APPROVED, AuthorizationStatus.EXPIRED])
  status!: AuthorizationStatus

  /** 审核备注 */
  @ApiProperty({
    description: '审核备注（可选）',
    example: '形象组符合规范，授权通过',
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string
}
