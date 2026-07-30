/**
 * 用户上传视频转模板工作流
 *
 * 编排用户上传视频后异步分析视频元数据并生成模板的完整流程：
 * 1. 从 OSS 下载视频到本地
 * 2. 并行：提取视频元数据 + 截取封面
 * 3. 视频分析（4 维度：场景/ASR/OCR/VLM）
 * 4. LLM 生成模板建议
 * 5. 上传封面到 OSS
 * 6. 完成：更新 Template 状态为 ACTIVE
 *
 * 失败路径：标记 Template 状态为 ANALYSIS_FAILED
 */
import { proxyActivities } from '@temporalio/workflow'
import type {
  TemplateActivities,
  TemplateGenerationInput,
  TemplateGenerationResult,
} from '../types'

// 仅引入类型，实际实现由 Worker 注册
type AllActivities = TemplateActivities

/**
 * 模板生成工作流入口
 *
 * @param input 模板生成参数（含 templateId / userId / ossKey / title）
 * @returns 生成结果（templateId / status / failureReason）
 */
export async function templateGenerationWorkflow(
  input: TemplateGenerationInput,
): Promise<TemplateGenerationResult> {
  // Activity 代理配置：统一的重试策略与超时
  // 注意：proxyActivities 必须在 workflow 函数内部调用，不能在模块顶层调用
  const activities = proxyActivities<AllActivities>({
    // 分析耗时较长，放宽 startToCloseTimeout
    startToCloseTimeout: '10 minutes',
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 2,
    },
  })

  const { templateId, userId, ossKey } = input

  try {
    // ---- 步骤 1：下载视频 ----
    const videoPath = await activities.downloadAssetVideo(ossKey)

    // ---- 步骤 2：并行提取元数据 + 截取封面 ----
    const [meta, thumbnailPath] = await Promise.all([
      activities.extractVideoMeta(videoPath),
      activities.generateTemplateThumbnail(videoPath),
    ])

    // ---- 步骤 3：视频分析（4 维度） ----
    const analysisReport = await activities.analyzeTemplateVideo(videoPath)

    // ---- 步骤 4：LLM 生成模板建议 ----
    const templateSuggestion = await activities.summarizeTemplate(analysisReport)

    // ---- 步骤 5：上传封面到 OSS ----
    const coverKey = await activities.uploadThumbnail({
      thumbnailPath,
      userId,
      templateId,
    })

    // ---- 步骤 6：完成：更新 Template 状态为 ACTIVE ----
    await activities.finalizeTemplate({
      templateId,
      meta,
      analysisReport,
      templateSuggestion,
      coverKey,
    })

    return { templateId, status: 'ACTIVE' }
  } catch (err) {
    // 失败：标记 Template 状态为 ANALYSIS_FAILED
    const failureReason = err instanceof Error ? err.message : String(err)

    // 标记失败本身不应阻断工作流返回，用 try-catch 兜底
    try {
      await activities.markTemplateFailed({
        templateId,
        reason: failureReason,
      })
    } catch {
      // 标记失败也出错时，仅记录日志，工作流仍返回失败状态
      // Temporal 会通过 Activity 重试机制处理 markTemplateFailed 的失败
    }

    return { templateId, status: 'ANALYSIS_FAILED', failureReason }
  }
}
