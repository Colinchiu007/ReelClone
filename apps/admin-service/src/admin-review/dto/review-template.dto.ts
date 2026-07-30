import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString } from 'class-validator'
import { TemplateStatus } from '@reelclone/database'

/**
 * 模板审核 DTO
 *
 * 运营在审核工作台对用户提交的模板进行审核。
 * status=ACTIVE 表示审核通过并上线，status=REJECTED 表示拒绝。
 */
export class ReviewTemplateDto {
  /** 审核后状态（仅允许 ACTIVE 或 REJECTED） */
  @ApiProperty({
    description: '审核后状态（ACTIVE 审核通过并上线 / REJECTED 拒绝）',
    example: 'ACTIVE',
    enum: [TemplateStatus.ACTIVE, TemplateStatus.REJECTED],
  })
  @IsIn([TemplateStatus.ACTIVE, TemplateStatus.REJECTED])
  status!: TemplateStatus

  /** 审核备注 */
  @ApiProperty({
    description: '审核备注（可选）',
    example: '模板内容符合规范，审核通过',
    required: false,
  })
  @IsOptional()
  @IsString()
  reviewNote?: string
}
