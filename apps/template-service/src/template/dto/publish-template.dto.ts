import { IsString, IsOptional, MaxLength, IsArray } from 'class-validator'

/**
 * 发布模板 DTO（用户 UGC 上传）
 *
 * 用于用户将作品转为模板时提交的数据。
 * 提交后状态为 PENDING_REVIEW，待运营审核。
 */
export class PublishTemplateDto {
  /** 模板标题 */
  @IsString()
  @MaxLength(128)
  title!: string

  /** 详细描述 */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  /** 提示词（来自作品的 prompt） */
  @IsString()
  prompt!: string

  /** 封面 OSS Key（来自作品缩略图） */
  @IsOptional()
  @IsString()
  coverKey?: string

  /** 视频 OSS Key（来自作品结果） */
  @IsOptional()
  @IsString()
  videoKey?: string

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

  /** 来源作品 ID */
  @IsOptional()
  @IsString()
  sourceWorkId?: string
}
