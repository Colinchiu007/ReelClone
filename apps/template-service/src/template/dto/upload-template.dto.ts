import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

/**
 * 用户上传视频转模板 DTO
 *
 * 用户通过小程序上传视频后，提交转模板请求。
 * assetId 必须为已上传到 asset-service 的视频资产 ID。
 * 提交后模板状态为 ANALYZING，Temporal 工作流异步分析视频并生成模板。
 */
export class UploadTemplateDto {
  /** 已上传的视频资产 ID（asset-service 登记） */
  @IsUUID()
  assetId!: string

  /** 模板标题 */
  @IsString()
  @MaxLength(128)
  title!: string

  /** 模板详细描述 */
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

  /** 适用平台 DOUYIN / XIAOHONGSHU / ... */
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
