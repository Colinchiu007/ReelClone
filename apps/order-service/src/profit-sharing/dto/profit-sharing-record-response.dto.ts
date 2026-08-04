/**
 * 分账记录响应 DTO
 *
 * 用于列表和详情接口的响应结构定义。
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProfitSharingStatus } from '@reelclone/database'

/** 分账明细响应 */
export class ProfitSharingItemResponseDto {
  @ApiProperty({ description: '明细 ID' })
  id!: string

  @ApiProperty({ description: '接收方名称' })
  receiverName!: string

  @ApiProperty({ description: '分账比例快照（万分之一）' })
  ratio!: number

  @ApiProperty({ description: '分账金额（分）' })
  amount!: number

  @ApiProperty({ description: '微信分账接收方类型' })
  receiverType!: string

  @ApiProperty({ description: '微信分账接收方 ID' })
  receiverAccountId!: string

  @ApiProperty({ description: '该明细的分账状态' })
  status!: string

  @ApiPropertyOptional({ description: '失败原因' })
  failReason!: string | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date
}

/** 分账记录响应（含明细） */
export class ProfitSharingRecordResponseDto {
  @ApiProperty({ description: '记录 ID' })
  id!: string

  @ApiProperty({ description: '关联订单 ID' })
  orderId!: string

  @ApiProperty({ description: '订单号' })
  orderNo!: string

  @ApiProperty({ description: '订单总金额（分）' })
  totalAmount!: number

  @ApiProperty({ description: '分账总金额（分）' })
  sharedAmount!: number

  @ApiProperty({ description: '分账状态', enum: ProfitSharingStatus })
  status!: ProfitSharingStatus

  @ApiPropertyOptional({ description: '微信分账单号' })
  profitSharingNo!: string | null

  @ApiProperty({ description: '已重试次数' })
  retryCount!: number

  @ApiProperty({ description: '最大重试次数' })
  maxRetryCount!: number

  @ApiPropertyOptional({ description: '失败原因' })
  failureReason!: string | null

  @ApiPropertyOptional({ description: '分账发起时间' })
  sharedAt!: Date | null

  @ApiPropertyOptional({ description: '回调时间' })
  callbackAt!: Date | null

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date

  @ApiPropertyOptional({
    description: '分账明细列表（详情接口返回）',
    type: [ProfitSharingItemResponseDto],
  })
  items?: ProfitSharingItemResponseDto[]
}
