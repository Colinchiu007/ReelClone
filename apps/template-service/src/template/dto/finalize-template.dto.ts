import { IsObject, IsString, IsUUID } from 'class-validator'

/**
 * 完成模板 DTO（内部 API，Temporal Activity 调用）
 *
 * 由 template.activities.ts 的 finalizeTemplate Activity 通过 HTTP 调用。
 * 更新 Template 状态为 ACTIVE，并写入视频元数据、分析报告、模板建议、封面 Key。
 */
export class FinalizeTemplateDto {
  /** 模板 ID */
  @IsString()
  templateId!: string

  /** 视频元数据（分辨率/时长/编码等） */
  @IsObject()
  meta!: Record<string, unknown>

  /** 视频分析报告（4 维度分析结果） */
  @IsObject()
  analysisReport!: Record<string, unknown>

  /** LLM 生成的结构化模板建议 */
  @IsObject()
  templateSuggestion!: Record<string, unknown>

  /** 封面 OSS Key */
  @IsString()
  coverKey!: string
}

/**
 * 标记模板失败 DTO（内部 API，Temporal Activity 调用）
 *
 * 由 template.activities.ts 的 markTemplateFailed Activity 通过 HTTP 调用。
 * 更新 Template 状态为 ANALYSIS_FAILED，并记录失败原因。
 */
export class FailTemplateDto {
  /** 模板 ID */
  @IsString()
  templateId!: string

  /** 失败原因 */
  @IsString()
  reason!: string
}

/**
 * 完成模板请求体（内部 API）
 *
 * 兼容 Temporal Activity 调用时的字段名（templateSuggestion 为对象）。
 */
export class FinalizeTemplateInternalDto {
  @IsUUID()
  templateId!: string

  @IsObject()
  meta!: Record<string, unknown>

  @IsObject()
  analysisReport!: Record<string, unknown>

  @IsObject()
  templateSuggestion!: Record<string, unknown>

  @IsString()
  coverKey!: string
}
