import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { ReceiverType } from '@reelclone/database'

/**
 * 更新分账接收方 DTO（所有字段可选）
 */
export class UpdateReceiverDto {
  @ApiPropertyOptional({ description: '接收方名称' })
  @IsString()
  @IsOptional()
  name?: string

  @ApiPropertyOptional({ enum: ReceiverType, description: '接收方类型' })
  @IsEnum(ReceiverType)
  @IsOptional()
  type?: ReceiverType

  @ApiPropertyOptional({ description: '分账比例（万分之一精度）', minimum: 1, maximum: 10000 })
  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  ratio?: number

  @ApiPropertyOptional({ description: '微信分账接收方类型' })
  @IsString()
  @IsOptional()
  receiverType?: string

  @ApiPropertyOptional({ description: '微信分账接收方 ID' })
  @IsString()
  @IsOptional()
  receiverAccountId?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsString()
  @IsOptional()
  remark?: string
}
