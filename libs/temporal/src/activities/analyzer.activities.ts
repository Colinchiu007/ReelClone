/**
 * 对标视频分析 Activity
 *
 * 负责对标视频的下载与 4 维度分析：
 * - 场景切分（PySceneDetect）
 * - 语音识别 ASR（FunASR / Whisper）
 * - 画面文字 OCR（PaddleOCR）
 * - 画面描述 VLM（Qwen3-VL）
 *
 * analyzeVideo 内部并行执行 4 维度分析，
 * summarizeReport 调用 LLM 将多源结果汇总为结构化报告。
 */
import { Context } from '@temporalio/activity'
import {
  type AnalyzerActivities,
  type AnalysisReport,
  type AsrResult,
  type OcrResult,
  type SceneSegment,
  type StructuredReport,
  type VlmResult,
} from '../types'
import { getActivityDependencies } from './activity-context'
import { isMockMode, mockId, mockDelay } from './mock.util'
import { mapAnalyzerReportToTemporal } from '../mappers'

/**
 * 下载对标视频到本地
 * @param url 源视频 URL（抖音/快手/小红书/B站/微信）
 * @returns 本地文件路径
 */
export async function downloadBenchmarkVideo(url: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Analyzer] 下载对标视频', { url })

  if (isMockMode()) {
    await mockDelay(400)
    return `/tmp/reelclone/benchmark/${mockId('bench')}.mp4`
  }

  // ---- 真实模式：调用 VideoDownloaderService ----
  const { videoDownloader } = getActivityDependencies()
  const result = await videoDownloader.download(url)
  ctx.log.info('[Analyzer] 对标视频已下载', {
    platform: result.platform,
    downloader: result.downloader,
    videoPath: result.videoPath,
  })
  return result.videoPath
}

/**
 * 视频分析（内部并行执行 4 维度）
 *
 * 真实模式下内部使用 Promise.all 并行调用：
 * - PySceneDetect 场景切分
 * - FunASR 语音识别
 * - PaddleOCR 画面文字
 * - Qwen3-VL 画面描述
 *
 * @param videoPath 本地视频路径
 * @returns 完整分析报告
 */
export async function analyzeVideo(videoPath: string): Promise<AnalysisReport> {
  const ctx = Context.current()
  ctx.log.info('[Analyzer] 开始视频分析', { videoPath })
  const startedAt = Date.now()

  if (isMockMode()) {
    const scenes: SceneSegment[] = [
      { index: 0, start: 0, end: 3.5, duration: 3.5, description: '开场产品展示' },
      { index: 1, start: 3.5, end: 8.2, duration: 4.7, description: '使用场景演示' },
      { index: 2, start: 8.2, end: 12.0, duration: 3.8, description: '价格促销信息' },
      { index: 3, start: 12.0, end: 15.0, duration: 3.0, description: '结尾引导下单' },
    ]

    const asr: AsrResult = {
      transcript: '这是一款超好用的产品，今天给大家推荐，限时特价只要 99 元，赶紧下单吧！',
      segments: [
        { start: 0, end: 3.5, text: '这是一款超好用的产品' },
        { start: 3.5, end: 8.2, text: '今天给大家推荐' },
        { start: 8.2, end: 12.0, text: '限时特价只要 99 元' },
        { start: 12.0, end: 15.0, text: '赶紧下单吧！' },
      ],
    }

    const ocr: OcrResult = {
      items: [
        { timestamp: 1.2, text: '爆款推荐', confidence: 0.98 },
        { timestamp: 9.5, text: '限时特价 99 元', confidence: 0.95 },
        { timestamp: 13.0, text: '点击下方链接', confidence: 0.92 },
      ],
    }

    const vlm: VlmResult = {
      descriptions: [
        { timestamp: 0.5, description: '近景展示产品外观与包装', sellingPoints: ['高颜值'] },
        { timestamp: 4.0, description: '真人演示产品使用过程', sellingPoints: ['易操作'] },
        { timestamp: 9.0, description: '画面叠加价格与促销标签', sellingPoints: ['性价比'] },
        { timestamp: 12.5, description: '指向购物车按钮引导下单', sellingPoints: ['促转化'] },
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
    ctx.log.info('[Analyzer][Mock] 分析完成', { scenes: scenes.length })
    return report
  }

  // ---- 真实模式：调用 VideoAnalyzerService 4 维度分析 ----
  const { videoAnalyzer } = getActivityDependencies()
  const analyzerReport = await videoAnalyzer.analyze(videoPath)
  const analysisMs = Date.now() - startedAt

  ctx.log.info('[Analyzer] 4 维度分析完成', {
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
 * LLM 汇总为结构化报告
 * 将场景 / ASR / OCR / VLM 多源结果输入 LLM，输出可复用的结构化脚本
 */
export async function summarizeReport(report: AnalysisReport): Promise<StructuredReport> {
  const ctx = Context.current()
  ctx.log.info('[Analyzer] LLM 汇总报告', { scenes: report.scenes.length })
  const startedAt = Date.now()

  if (isMockMode()) {
    await mockDelay(500)
    const structured: StructuredReport = {
      style: '快节奏带货种草风，节奏紧凑，3 秒内抓住注意力',
      pacing: '15 秒短视频，4 个场景，平均镜头时长 3.75 秒，前 3 秒高密度信息输出',
      shotList: report.scenes.map((scene, idx) => ({
        sceneIndex: idx,
        duration: scene.duration,
        visual: scene.description ?? '',
        voiceover: report.asr.segments[idx]?.text ?? '',
        onScreenText: report.ocr.items[idx]?.text ?? '',
      })),
      copywriting: {
        hook: '这是一款超好用的产品',
        body: '今天给大家推荐，真人演示使用过程',
        cta: '限时特价 99 元，赶紧下单吧！',
      },
      sellingPoints: ['高颜值', '易操作', '性价比', '促转化'],
      templateSuggestion: '建议复用「3 秒痛点 hook + 真人演示 + 价格刺激 + CTA 引导」结构',
      summaryMs: Date.now() - startedAt,
    }
    ctx.log.info('[Analyzer][Mock] 汇总完成')
    return structured
  }

  // ---- 真实模式：调用 LLM 输出 JSON 结构化报告 ----
  const { llmProvider, validateLlmStructuredReport, sanitizePromptInput } = getActivityDependencies()

  const prompt = buildSummaryPrompt(report, sanitizePromptInput)
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
    ctx.log.warn('[Analyzer] LLM 返回非 JSON，回退模板汇总', {
      error: (err as Error).message,
      preview: cleaned.slice(0, 120),
    })
    parsed = buildFallbackStructuredReport(report)
  }

  // B4: 使用字段级校验器替代原 `??` 链
  //  - 原逻辑：copywriting 缺 hook → 整个 copywriting 被替换，丢失 body/cta
  //  - 新逻辑：字段级容错，有效字段保留，无效字段走兜底
  const { report: valid, errors } = validateLlmStructuredReport(parsed)
  if (errors.length > 0) {
    ctx.log.warn('[Analyzer] LLM 输出字段校验失败，部分字段走兜底', { errors })
  }

  const result: StructuredReport = {
    style: valid.style ?? '快节奏带货种草风',
    pacing: valid.pacing ?? `${report.duration}秒短视频，${report.scenes.length} 个场景`,
    shotList:
      valid.shotList ??
      report.scenes.map((scene, idx) => ({
        sceneIndex: idx,
        duration: scene.duration,
        visual: scene.description ?? '',
        voiceover: report.asr.segments[idx]?.text ?? '',
        onScreenText: report.ocr.items[idx]?.text ?? '',
      })),
    copywriting: valid.copywriting ?? {
      hook: report.asr.segments[0]?.text ?? '',
      body: report.asr.segments
        .slice(1, -1)
        .map((s) => s.text)
        .join(' '),
      cta: report.asr.segments[report.asr.segments.length - 1]?.text ?? '',
    },
    sellingPoints:
      valid.sellingPoints ?? report.vlm.descriptions.flatMap((d) => d.sellingPoints ?? []),
    templateSuggestion:
      valid.templateSuggestion ?? '建议复用「痛点 hook + 演示 + 价格刺激 + CTA」结构',
    summaryMs: Date.now() - startedAt,
  }

  ctx.log.info('[Analyzer] LLM 汇总完成', { summaryMs: result.summaryMs })
  return result
}

// -------------------- 提示词构建 --------------------

/** 构建结构化汇总提示词（要求 LLM 返回 JSON） */
function buildSummaryPrompt(
  report: AnalysisReport,
  sanitizePromptInput: (input: unknown) => string,
): string {
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
    '以下是对标视频的多维度分析结果，请汇总为结构化报告：',
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

/** 分析 Activity 实现集合 */
export const analyzerActivities: AnalyzerActivities = {
  downloadBenchmarkVideo,
  analyzeVideo,
  summarizeReport,
}
