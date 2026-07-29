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
import { isMockMode, mockId, mockDelay } from './mock.util'

/**
 * 下载对标视频到本地
 * @param url 源视频 URL（抖音/快手/小红书/B站/微信）
 * @returns 本地文件路径
 */
export async function downloadBenchmarkVideo(url: string): Promise<string> {
  const ctx = Context.current()
  ctx.log.info('[Analyzer] 下载对标视频', { url })

  if (isMockMode()) {
    // TODO: 替换为真实下载适配器
    //   import { downloadAdapter } from '@reelclone/ai'
    //   return downloadAdapter.download(url, { dest: '/tmp/reelclone/benchmark' })
    await mockDelay(400)
    return `/tmp/reelclone/benchmark/${mockId('bench')}.mp4`
  }

  throw new Error('[Analyzer] 真实模式尚未接入 libs/ai 下载适配器')
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
    // TODO: 替换为真实分析器
    //   import { storyAnalyzer } from '@reelclone/ai'
    //   const [scenes, asr, ocr, vlm] = await Promise.all([
    //     storyAnalyzer.detectScenes(videoPath),
    //     storyAnalyzer.transcribe(videoPath),
    //     storyAnalyzer.ocr(videoPath),
    //     storyAnalyzer.describe(videoPath),
    //   ])
    await mockDelay(800)

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

  throw new Error('[Analyzer] 真实模式尚未接入 libs/ai 分析器')
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
    // TODO: 替换为真实 LLM 调用
    //   import { llmAdapter, promptEngine } from '@reelclone/ai'
    //   const prompt = promptEngine.render('benchmark-summary', { report })
    //   const text = await llmAdapter.chat({ messages: [{ role: 'user', content: prompt }] })
    //   return JSON.parse(text)
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

  throw new Error('[Analyzer] 真实模式尚未接入 libs/ai LLM 适配器')
}

/** 分析 Activity 实现集合 */
export const analyzerActivities: AnalyzerActivities = {
  downloadBenchmarkVideo,
  analyzeVideo,
  summarizeReport,
}
