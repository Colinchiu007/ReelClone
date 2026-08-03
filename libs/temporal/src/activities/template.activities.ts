/**
 * 用户上传视频转模板 Activity
 *
 * 负责用户上传视频后异步分析视频元数据并生成模板的完整流程：
 * - downloadAssetVideo: 从 OSS 下载视频到本地临时目录
 * - extractVideoMeta: 提取视频元数据（分辨率/时长/编码）
 * - generateTemplateThumbnail: 截取封面（第 1 秒）
 * - analyzeTemplateVideo: 4 维度分析（场景/ASR/OCR/VLM，复用 VideoAnalyzerService）
 * - summarizeTemplate: LLM 生成模板建议（复用 LlmProvider）
 * - uploadThumbnail: 上传封面到 OSS
 * - finalizeTemplate: 更新 Template 状态为 ACTIVE（HTTP 调用 template-service 内部 API）
 * - markTemplateFailed: 标记 Template 状态为 ANALYSIS_FAILED（HTTP 调用 template-service 内部 API）
 *
 * Mock 模式下所有 Activity 返回合理的 Mock 数据，不依赖真实服务。
 */
import { Context } from '@temporalio/activity'
import axios from 'axios'
import { validateLlmStructuredReport, sanitizePromptInput } from '@reelclone/ai'
import {
  type AnalysisReport,
  type AsrResult,
  type OcrResult,
  type SceneSegment,
  type StructuredReport,
  type TemplateActivities,
  type VlmResult,
} from '../types'
import { getActivityDependencies } from './activity-context'
import { isMockMode, mockId, mockDelay } from './mock.util'

// ============================================================
// 类型映射：libs/ai AnalysisReport → libs/temporal AnalysisReport
// ============================================================

/**
 * 将 libs/ai 的 AnalysisReport（含 shots/transcript/ocr/visualDescription）
 * 映射为 libs/temporal 的 AnalysisReport（含 scenes/asr/ocr/vlm）。
 *
 * 与 analyzer.activities.ts 中的映射逻辑一致，此处独立维护避免跨模块耦合。
 */
function mapAnalyzerReportToTemporal(
  analyzerReport: import('@reelclone/ai').AnalysisReport,
  analysisMs: number,
): AnalysisReport {
  const { shots, transcript, ocr, visualDescription } = analyzerReport

  // 1. scenes
  const scenes: SceneSegment[] = shots.map((s) => ({
    index: s.index,
    start: s.startTime,
    end: s.endTime,
    duration: s.duration,
    keyframePath: s.keyframeUrl,
    description: s.shotType,
  }))

  // 2. asr
  const asr: AsrResult = {
    transcript: transcript.map((t) => t.text).join(' '),
    segments: transcript.map((t) => ({
      start: t.startTime,
      end: t.endTime,
      text: t.text,
    })),
  }

  // 3. ocr
  const ocrResult: OcrResult = {
    items: ocr.map((o) => ({
      timestamp: o.time,
      text: o.text,
      confidence: o.confidence ?? 0,
      box: o.bbox,
    })),
  }

  // 4. vlm
  const vlm: VlmResult = {
    descriptions: visualDescription.map((v) => ({
      timestamp: v.time,
      description: v.description,
      sellingPoints: v.tags,
    })),
  }

  // 5. duration：取最后一个镜头的 endTime 作为视频总时长
  const duration = shots.length > 0 ? shots[shots.length - 1].endTime : 0

  return {
    duration,
    scenes,
    asr,
    ocr: ocrResult,
    vlm,
    analysisMs,
  }
}

// ============================================================
// Activity 实现
// ============================================================

/**
 * 从 OSS 下载视频到本地临时目录
 *
 * MVP 简化：参数直接接收 ossKey（而非 assetId），避免需要查询 asset-service。
 *
 * @param ossKey 视频在 OSS 中的 Key
 * @returns 本地视频文件绝对路径
 */
export async function downloadAssetVideo(ossKey: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Template] 下载视频', { ossKey })

  if (isMockMode()) {
    await mockDelay(400)
    const localPath = `/tmp/reelclone/template/${mockId('tpl')}.mp4`
    ctx.log.info('[Template][Mock] 视频已下载', { localPath })
    return localPath
  }

  // ---- 真实模式：调用 OSSService 下载 ----
  const { ossService } = getActivityDependencies()
  const localPath = `/tmp/reelclone/template/${mockId('tpl')}.mp4`
  await ossService.download(ossKey, localPath)
  ctx.log.info('[Template] 视频已下载', { ossKey, localPath })
  return localPath
}

/**
 * 提取视频元数据（分辨率/时长/编码）
 *
 * @param videoPath 本地视频路径
 * @returns 视频元信息
 */
export async function extractVideoMeta(
  videoPath: string,
): Promise<import('@reelclone/ai').VideoMetaInfo> {
  const ctx = Context.current()
  ctx.log.info('[Template] 提取视频元数据', { videoPath })

  if (isMockMode()) {
    await mockDelay(200)
    const meta = {
      duration: 15,
      width: 1080,
      height: 1920,
      videoBitrate: 2_500_000,
      audioBitrate: 128_000,
      videoCodec: 'h264',
      audioCodec: 'aac',
      fps: 30,
      size: 4_800_000,
    }
    ctx.log.info('[Template][Mock] 元数据提取完成', { meta })
    return meta
  }

  // ---- 真实模式：调用 FfmpegService.getMetadata ----
  const { ffmpegService } = getActivityDependencies()
  const meta = await ffmpegService.getMetadata(videoPath)
  ctx.log.info('[Template] 元数据提取完成', {
    duration: meta.duration,
    width: meta.width,
    height: meta.height,
    codec: meta.videoCodec,
  })
  return meta
}

/**
 * 截取封面（第 1 秒）
 *
 * @param videoPath 本地视频路径
 * @returns 本地封面文件路径
 */
export async function generateTemplateThumbnail(videoPath: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Template] 生成封面', { videoPath })

  if (isMockMode()) {
    await mockDelay(200)
    const thumbnailPath = videoPath.replace(/\.\w+$/, '_thumb.jpg')
    ctx.log.info('[Template][Mock] 封面已生成', { thumbnailPath })
    return thumbnailPath
  }

  // ---- 真实模式：调用 FfmpegService.generateThumbnail ----
  const { ffmpegService } = getActivityDependencies()
  const thumbnailPath = videoPath.replace(/\.\w+$/, '_thumb.jpg')
  await ffmpegService.generateThumbnail(videoPath, 1, thumbnailPath)
  ctx.log.info('[Template] 封面已生成', { thumbnailPath })
  return thumbnailPath
}

/**
 * 视频分析（4 维度：场景/ASR/OCR/VLM）
 *
 * 复用 VideoAnalyzerService.analyze，并将结果映射为 libs/temporal 的 AnalysisReport。
 *
 * @param videoPath 本地视频路径
 * @returns 完整分析报告
 */
export async function analyzeTemplateVideo(videoPath: string): Promise<AnalysisReport> {
  const ctx = Context.current()
  ctx.log.info('[Template] 开始视频分析', { videoPath })
  const startedAt = Date.now()

  if (isMockMode()) {
    // Mock 模式下返回与分析器一致的 Mock 数据，便于联调
    const scenes: SceneSegment[] = [
      { index: 0, start: 0, end: 2.5, duration: 2.5, description: '产品特写' },
      { index: 1, start: 2.5, end: 5, duration: 2.5, description: '口播讲解' },
      { index: 2, start: 5, end: 8, duration: 3, description: '使用场景' },
      { index: 3, start: 8, end: 10, duration: 2, description: '效果对比' },
      { index: 4, start: 10, end: 15, duration: 5, description: '行动号召' },
    ]

    const asr: AsrResult = {
      transcript:
        '姐妹们看这个神仙好物！它采用了全新配方，质地超细腻。上脸就是奶油肌，持妆一整天。对比一下，效果立竿见影。现在下单立减 50，手慢无！',
      segments: [
        { start: 0, end: 2.5, text: '姐妹们看这个神仙好物！' },
        { start: 2.5, end: 5, text: '它采用了全新配方，质地超细腻。' },
        { start: 5, end: 8, text: '上脸就是奶油肌，持妆一整天。' },
        { start: 8, end: 10, text: '对比一下，效果立竿见影。' },
        { start: 10, end: 15, text: '现在下单立减 50，手慢无！' },
      ],
    }

    const ocr: OcrResult = {
      items: [
        { timestamp: 0.5, text: '新品上市', confidence: 0.98 },
        { timestamp: 5, text: '持妆 24 小时', confidence: 0.95 },
        { timestamp: 10, text: '限时特惠 ¥99', confidence: 0.99 },
      ],
    }

    const vlm: VlmResult = {
      descriptions: [
        {
          timestamp: 1,
          description: '产品瓶身特写，暖色调灯光突出质感',
          sellingPoints: ['产品特写', '暖色调'],
        },
        {
          timestamp: 3.5,
          description: '博主手持产品对口播讲解',
          sellingPoints: ['口播', '真人出镜'],
        },
        {
          timestamp: 6,
          description: '模特上脸试用，展示奶油肌妆效',
          sellingPoints: ['试用', '妆效展示'],
        },
        {
          timestamp: 9,
          description: '左右对比图展示使用前后差异',
          sellingPoints: ['对比', '效果'],
        },
        {
          timestamp: 12,
          description: '购物车动画与价格信息弹出',
          sellingPoints: ['行动号召', '促销'],
        },
      ],
    }

    await mockDelay(800)
    const report: AnalysisReport = {
      duration: 15.0,
      scenes,
      asr,
      ocr,
      vlm,
      analysisMs: Date.now() - startedAt,
    }
    ctx.log.info('[Template][Mock] 分析完成', { scenes: scenes.length })
    return report
  }

  // ---- 真实模式：调用 VideoAnalyzerService 4 维度分析 ----
  const { videoAnalyzer } = getActivityDependencies()
  const analyzerReport = await videoAnalyzer.analyze(videoPath)
  const analysisMs = Date.now() - startedAt

  ctx.log.info('[Template] 4 维度分析完成', {
    shots: analyzerReport.shots.length,
    transcript: analyzerReport.transcript.length,
    ocr: analyzerReport.ocr.length,
    vlm: analyzerReport.visualDescription.length,
    analysisMs,
  })

  // 将 libs/ai 的报告结构映射为 libs/temporal 的 AnalysisReport
  return mapAnalyzerReportToTemporal(analyzerReport, analysisMs)
}

/**
 * LLM 生成模板建议
 *
 * 将视频分析报告输入 LLM，输出可复用的结构化模板建议。
 * 复用 analyzer.activities.ts 中 summarizeReport 的提示词构建逻辑。
 *
 * @param analysisReport 视频分析报告
 * @returns 结构化模板建议
 */
export async function summarizeTemplate(analysisReport: AnalysisReport): Promise<StructuredReport> {
  const ctx = Context.current()
  ctx.log.info('[Template] LLM 生成模板建议', { scenes: analysisReport.scenes.length })
  const startedAt = Date.now()

  if (isMockMode()) {
    await mockDelay(500)
    const structured: StructuredReport = {
      style: '快节奏带货种草风，竖屏短视频',
      pacing: '15 秒短视频，5 个场景，平均镜头时长 3.0 秒，前 3 秒高密度信息输出',
      shotList: analysisReport.scenes.map((scene, idx) => ({
        sceneIndex: idx,
        duration: scene.duration,
        visual: scene.description ?? '',
        voiceover: analysisReport.asr.segments[idx]?.text ?? '',
        onScreenText: analysisReport.ocr.items[idx]?.text ?? '',
      })),
      copywriting: {
        hook: analysisReport.asr.segments[0]?.text ?? '',
        body: analysisReport.asr.segments
          .slice(1, -1)
          .map((s) => s.text)
          .join(' '),
        cta: analysisReport.asr.segments[analysisReport.asr.segments.length - 1]?.text ?? '',
      },
      sellingPoints: analysisReport.vlm.descriptions.flatMap((d) => d.sellingPoints ?? []),
      templateSuggestion: '建议复用「3 秒痛点 hook + 产品演示 + 效果对比 + CTA 引导」结构',
      summaryMs: Date.now() - startedAt,
    }
    ctx.log.info('[Template][Mock] 模板建议生成完成')
    return structured
  }

  // ---- 真实模式：调用 LLM 输出 JSON 结构化模板建议 ----
  const { llmProvider } = getActivityDependencies()

  const prompt = buildTemplatePrompt(analysisReport)
  const system =
    '你是一位短视频内容策略分析师，擅长从镜头、口播、画面文字、视觉描述中提炼可复用的创作模板。' +
    '请严格输出 JSON 格式（不要包含 ```json 代码块标记），字段包括：' +
    'style(字符串), pacing(字符串), shotList(数组:sceneIndex,duration,visual,voiceover,onScreenText),' +
    'copywriting(对象:hook,body,cta), sellingPoints(字符串数组), templateSuggestion(字符串)。'

  const text = await llmProvider.complete(
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.5, maxTokens: 1024 },
  )

  // 解析 LLM 返回的 JSON（容错：去除可能的 ```json 代码块标记）
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    ctx.log.warn('[Template] LLM 返回非 JSON，回退模板汇总', {
      error: (err as Error).message,
      preview: cleaned.slice(0, 120),
    })
    parsed = buildFallbackStructuredReport(analysisReport)
  }

  // B4: 使用字段级校验器替代原 `??` 链
  //  - 原逻辑：copywriting 缺 hook → 整个 copywriting 被替换，丢失 body/cta
  //  - 新逻辑：字段级容错，有效字段保留，无效字段走兜底
  const { report: valid, errors } = validateLlmStructuredReport(parsed)
  if (errors.length > 0) {
    ctx.log.warn('[Template] LLM 输出字段校验失败，部分字段走兜底', { errors })
  }

  const result: StructuredReport = {
    style: valid.style ?? '快节奏带货种草风',
    pacing:
      valid.pacing ?? `${analysisReport.duration}秒短视频，${analysisReport.scenes.length} 个场景`,
    shotList:
      valid.shotList ??
      analysisReport.scenes.map((scene, idx) => ({
        sceneIndex: idx,
        duration: scene.duration,
        visual: scene.description ?? '',
        voiceover: analysisReport.asr.segments[idx]?.text ?? '',
        onScreenText: analysisReport.ocr.items[idx]?.text ?? '',
      })),
    copywriting: valid.copywriting ?? {
      hook: analysisReport.asr.segments[0]?.text ?? '',
      body: analysisReport.asr.segments
        .slice(1, -1)
        .map((s) => s.text)
        .join(' '),
      cta: analysisReport.asr.segments[analysisReport.asr.segments.length - 1]?.text ?? '',
    },
    sellingPoints:
      valid.sellingPoints ?? analysisReport.vlm.descriptions.flatMap((d) => d.sellingPoints ?? []),
    templateSuggestion:
      valid.templateSuggestion ?? '建议复用「痛点 hook + 演示 + 价格刺激 + CTA」结构',
    summaryMs: Date.now() - startedAt,
  }

  ctx.log.info('[Template] LLM 模板建议生成完成', { summaryMs: result.summaryMs })
  return result
}

/**
 * 上传封面到 OSS
 *
 * @param params 包含本地封面路径、用户 ID、模板 ID
 * @returns 封面在 OSS 中的 Key
 */
export async function uploadThumbnail(params: {
  thumbnailPath: string
  userId: string
  templateId: string
}): Promise<string> {
  const ctx = Context.current()
  const { thumbnailPath, userId, templateId } = params
  ctx.log.info('[Template] 上传封面', { thumbnailPath, userId, templateId })

  // 封面 Key 命名规则：templates/covers/{userId}/{templateId}.jpg
  const coverKey = `templates/covers/${userId}/${templateId}.jpg`

  if (isMockMode()) {
    await mockDelay(200)
    ctx.log.info('[Template][Mock] 封面已上传', { coverKey })
    return coverKey
  }

  // ---- 真实模式：调用 OSSService 上传 ----
  const { ossService } = getActivityDependencies()
  await ossService.upload(thumbnailPath, coverKey)
  ctx.log.info('[Template] 封面已上传', { coverKey })
  return coverKey
}

/**
 * 完成模板：更新 Template 状态为 ACTIVE
 *
 * 通过 HTTP 调用 template-service 的内部端点更新模板。
 * 端点：POST /api/v1/templates/internal/finalize
 *
 * @param params 包含模板 ID、视频元数据、分析报告、模板建议、封面 Key
 */
export async function finalizeTemplate(params: {
  templateId: string
  meta: import('@reelclone/common').VideoMetaInfo
  analysisReport: AnalysisReport
  templateSuggestion: StructuredReport
  coverKey: string
}): Promise<void> {
  const ctx = Context.current()
  ctx.log.info('[Template] 完成模板', { templateId: params.templateId })

  if (isMockMode()) {
    await mockDelay(100)
    ctx.log.info('[Template][Mock] 模板已完成', { templateId: params.templateId })
    return
  }

  // ---- 真实模式：HTTP 调用 template-service 内部端点 ----
  const baseUrl = process.env.TEMPLATE_SERVICE_URL || 'http://localhost:3005'
  const apiKey = process.env.INTERNAL_API_KEY
  await axios.post(
    `${baseUrl}/api/v1/templates/internal/finalize`,
    {
      templateId: params.templateId,
      meta: params.meta,
      analysisReport: params.analysisReport,
      templateSuggestion: params.templateSuggestion,
      coverKey: params.coverKey,
    },
    {
      timeout: 10_000,
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    },
  )
  ctx.log.info('[Template] 模板已完成', { templateId: params.templateId })
}

/**
 * 标记模板失败：更新 Template 状态为 ANALYSIS_FAILED
 *
 * 通过 HTTP 调用 template-service 的内部端点更新模板。
 * 端点：POST /api/v1/templates/internal/fail
 *
 * @param params 包含模板 ID 和失败原因
 */
export async function markTemplateFailed(params: {
  templateId: string
  reason: string
}): Promise<void> {
  const ctx = Context.current()
  ctx.log.info('[Template] 标记模板失败', {
    templateId: params.templateId,
    reason: params.reason,
  })

  if (isMockMode()) {
    await mockDelay(100)
    ctx.log.info('[Template][Mock] 模板已标记失败', { templateId: params.templateId })
    return
  }

  // ---- 真实模式：HTTP 调用 template-service 内部端点 ----
  const baseUrl = process.env.TEMPLATE_SERVICE_URL || 'http://localhost:3005'
  const apiKey = process.env.INTERNAL_API_KEY
  await axios.post(
    `${baseUrl}/api/v1/templates/internal/fail`,
    {
      templateId: params.templateId,
      reason: params.reason,
    },
    {
      timeout: 10_000,
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
    },
  )
  ctx.log.info('[Template] 模板已标记失败', { templateId: params.templateId })
}

// -------------------- 提示词构建 --------------------

/** 构建模板建议提示词（要求 LLM 返回 JSON） */
function buildTemplatePrompt(report: AnalysisReport): string {
  // B5: 对 OCR/ASR/VLM 文本进行 Prompt Injection 脱敏
  const shotsText = report.scenes
    .map(
      (s) =>
        `  ${s.index}. [${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${sanitizePromptInput(s.description ?? '未知镜头')}（${s.duration.toFixed(1)}s）`,
    )
    .join('\n')
  const transcriptText = report.asr.segments
    .map((t) => `  [${t.start.toFixed(1)}s] ${sanitizePromptInput(t.text)}`)
    .join('\n')
  const ocrText = report.ocr.items.map((o) => `  ${sanitizePromptInput(o.text)}`).join('\n')
  const vlmText = report.vlm.descriptions
    .map((v) => `  ${sanitizePromptInput(v.description)}`)
    .join('\n')

  return [
    '以下是用户上传视频的多维度分析结果，请汇总为可复用的创作模板：',
    '',
    '【镜头切分】',
    shotsText || '  无',
    '',
    '【口播文案（ASR）】',
    transcriptText || '  无',
    '',
    '【画面文字（OCR）】',
    ocrText || '  无',
    '',
    '【画面描述（VLM）】',
    vlmText || '  无',
    '',
    '请输出 JSON 格式报告，包含字段：',
    '1. style: 视频整体风格判断（字符串）',
    '2. pacing: 节奏与时长结构建议（字符串）',
    '3. shotList: 可复用的镜头结构清单（数组，每项含 sceneIndex/duration/visual/voiceover/onScreenText）',
    '4. copywriting: 文案拆解（对象，含 hook/body/cta）',
    '5. sellingPoints: 核心卖点（字符串数组）',
    '6. templateSuggestion: 一键复刻要点（字符串）',
  ].join('\n')
}

/** LLM 解析失败时的兜底结构化报告（基于分析报告模板生成） */
function buildFallbackStructuredReport(report: AnalysisReport): Partial<StructuredReport> {
  return {
    style: '快节奏带货种草风',
    pacing: `${report.duration}秒短视频，${report.scenes.length} 个场景`,
    shotList: report.scenes.map((scene, idx) => ({
      sceneIndex: idx,
      duration: scene.duration,
      visual: scene.description ?? '',
      voiceover: report.asr.segments[idx]?.text ?? '',
      onScreenText: report.ocr.items[idx]?.text ?? '',
    })),
    copywriting: {
      hook: report.asr.segments[0]?.text ?? '',
      body: report.asr.segments
        .slice(1, -1)
        .map((s) => s.text)
        .join(' '),
      cta: report.asr.segments[report.asr.segments.length - 1]?.text ?? '',
    },
    sellingPoints: report.vlm.descriptions.flatMap((d) => d.sellingPoints ?? []),
    templateSuggestion: '建议复用「痛点 hook + 演示 + 价格刺激 + CTA」结构',
  }
}

/** 模板生成 Activity 实现集合 */
export const templateActivities: TemplateActivities = {
  downloadAssetVideo,
  extractVideoMeta,
  generateTemplateThumbnail,
  analyzeTemplateVideo,
  summarizeTemplate,
  uploadThumbnail,
  finalizeTemplate,
  markTemplateFailed,
}
