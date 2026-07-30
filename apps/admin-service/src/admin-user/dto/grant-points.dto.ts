/**
 * 人工调账 DTO
 *
 * 管理员手动给用户增加积分，需记录调账原因。
 * 调用 billing-service 的 POST /api/v1/points/grant 完成。
 */
import { ApiProperty } from '@nestjs/swagger'
import { IsInt, IsString, MaxLength, Min } from 'class-validator'

export class GrantPointsDto {
  /** 调账数量（>0） */
  @ApiProperty({
    description: '调账数量（正整数，>0）',
    example: 100,
  })
  @IsInt()
  @Min(1)
  amount!: number

  /** 调账原因（用于操作日志） */
  @ApiProperty({
    description: '调账原因（用于操作日志，最多 256 字符）',
    example: '补偿用户积分',
  })
  @IsString()
  @MaxLength(256)
  reason!: string
}
