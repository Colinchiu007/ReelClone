import { IsString, IsOptional, MaxLength, IsArray } from 'class-validator'

/**
 * 作品转模板 DTO
 *
 * 用户将已完成的视频作品转为模板时提交的数据。
 * work 层独立定义此 DTO（不依赖 template-service 的 DTO），通过 HTTP client 调用 template-service。
 */
export class PublishFromWorkDto {
  /** 模板标题 */
  @IsString()
  @MaxLength(128)
  title!: string

  /** 详细描述 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  /** 分类 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string

  /** 适用行业 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  industry?: string

  /** 适用平台 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string

  /** 标签数组 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]
}
