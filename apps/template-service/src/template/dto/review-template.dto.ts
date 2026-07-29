import { IsOptional, IsString, IsEnum } from 'class-validator'
import { TemplateStatus } from '@reelclone/database'

/**
 * 审核模板 DTO
 *
 * 运营审核用户提交的模板时使用。
 * status=ACTIVE 表示审核通过并上线，status=REJECTED 表示拒绝。
 */
export class ReviewTemplateDto {
  /** 审核后状态（ACTIVE 或 REJECTED） */
  @IsEnum(TemplateStatus)
  status!: TemplateStatus

  /** 审核备注 */
  @IsOptional()
  @IsString()
  reviewNote?: string
}
