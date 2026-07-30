/**
 * 通知列表查询 DTO
 *
 * 对应 GET /api/v1/notifications
 * 字段说明：
 *  - page:       页码，1 基，默认 1
 *  - pageSize:   每页条数，默认 20，最大 100（防止单页拉爆内存）
 *  - type:       可选，按通知类型筛选
 *  - isRead:     可选，按已读状态筛选
 */
import { Transform, Type } from 'class-transformer'
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { NotificationType } from '@reelclone/database'

export class ListNotificationsDto {
  @ApiProperty({
    description: '页码，1 基，默认 1',
    example: 1,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1

  @ApiProperty({
    description: '每页条数，默认 20，最大 100',
    example: 20,
    required: false,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize: number = 20

  @ApiProperty({
    description: '按通知类型筛选（TASK_COMPLETED / TASK_FAILED / PAYMENT_SUCCESS / SYSTEM）',
    example: 'SYSTEM',
    required: false,
    enum: NotificationType,
  })
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType

  @ApiProperty({
    description: '按已读状态筛选，true 仅返回已读，false 仅返回未读',
    example: false,
    required: false,
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined
    if (typeof value === 'boolean') return value
    if (value === 'true' || value === '1' || value === 1) return true
    if (value === 'false' || value === '0' || value === 0) return false
    return undefined
  })
  @IsBoolean()
  @IsOptional()
  isRead?: boolean
}
