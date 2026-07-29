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
  @IsIn([AuthorizationStatus.APPROVED, AuthorizationStatus.EXPIRED])
  status!: AuthorizationStatus

  /** 审核备注 */
  @IsOptional()
  @IsString()
  note?: string
}
