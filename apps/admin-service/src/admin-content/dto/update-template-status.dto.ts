/**
 * 模板上下架 DTO
 *
 * 对应 PUT /api/v1/admin/templates/:id/status
 * 字段说明：
 *  - status: 目标状态，仅允许 ACTIVE（上架）/ OFFLINE（下架）
 *
 * 注意：TemplateStatus 枚举还包含 PENDING_REVIEW / REJECTED，
 * 但这两个状态由审核流程控制，管理员不可直接设置。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import { TemplateStatus } from '@reelclone/database'

export class UpdateTemplateStatusDto {
  @ApiProperty({
    description: '目标状态，仅允许 ACTIVE（上架）/ OFFLINE（下架）',
    example: 'ACTIVE',
    enum: [TemplateStatus.ACTIVE, TemplateStatus.OFFLINE],
  })
  @IsIn([TemplateStatus.ACTIVE, TemplateStatus.OFFLINE])
  status: TemplateStatus
}
