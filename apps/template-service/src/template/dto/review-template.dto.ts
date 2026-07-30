import { IsOptional, IsString, IsEnum } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { TemplateStatus } from '@reelclone/database'

/**
 * 审核模板 DTO
 *
 * 运营审核用户提交的模板时使用。
 * status=ACTIVE 表示审核通过并上线，status=REJECTED 表示拒绝。
 */
export class ReviewTemplateDto {
  /** 审核后状态（ACTIVE 或 REJECTED） */
  @ApiProperty({
    description: '审核后状态（ACTIVE 或 REJECTED）',
    example: TemplateStatus.ACTIVE,
    enum: TemplateStatus,
  })
  @IsEnum(TemplateStatus)
  status!: TemplateStatus

  /** 审核备注 */
  @ApiProperty({
    description: '审核备注',
    example: '内容符合规范，审核通过。',
    required: false,
  })
  @IsOptional()
  @IsString()
  reviewNote?: string
}
