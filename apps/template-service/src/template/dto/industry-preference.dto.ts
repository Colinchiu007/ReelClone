/**
 * 行业偏好设置 DTO
 *
 * 请求体: { industries: string[] }
 * 约束: 1-3 个行业标签
 */
import { IsArray, IsString, ArrayMinSize, ArrayMaxSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

/**
 * 行业偏好设置请求体
 */
export class IndustryPreferenceDto {
  /** 行业标签列表（1-3 个） */
  @ApiProperty({
    description: '行业标签列表（1-3 个）',
    example: ['好物种草', '本地生活'],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  industries: string[]
}
