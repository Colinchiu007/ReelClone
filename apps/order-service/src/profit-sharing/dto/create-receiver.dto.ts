import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ReceiverType } from '@reelclone/database'

/**
 * 创建分账接收方 DTO
 *
 * ratio 精度为万分之一（7000 = 70%，最大 10000 = 100%）
 */
export class CreateReceiverDto {
  @ApiProperty({ description: '接收方名称' })
  @IsString()
  @IsNotEmpty()
  name: string

  @ApiProperty({ enum: ReceiverType, description: '接收方类型' })
  @IsEnum(ReceiverType)
  type: ReceiverType

  @ApiProperty({ description: '分账比例（万分之一精度，7000 = 70%）', minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  ratio: number

  @ApiProperty({ description: '微信分账接收方类型（OPENID / MERCHANT_ID）' })
  @IsString()
  @IsNotEmpty()
  receiverType: string

  @ApiProperty({ description: '微信分账接收方 ID' })
  @IsString()
  @IsNotEmpty()
  receiverAccountId: string

  @ApiPropertyOptional({ description: '备注' })
  @IsString()
  @IsOptional()
  remark?: string
}
