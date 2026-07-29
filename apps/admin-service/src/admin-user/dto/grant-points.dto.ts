/**
 * 人工调账 DTO
 *
 * 管理员手动给用户增加积分，需记录调账原因。
 * 调用 billing-service 的 POST /api/v1/points/grant 完成。
 */
import { IsInt, IsString, MaxLength, Min } from 'class-validator'

export class GrantPointsDto {
  /** 调账数量（>0） */
  @IsInt()
  @Min(1)
  amount!: number

  /** 调账原因（用于操作日志） */
  @IsString()
  @MaxLength(256)
  reason!: string
}
