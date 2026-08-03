/**
 * Temporal 共享类型映射函数
 *
 * 将 libs/ai 的 AnalysisReport（含 shots/transcript/ocr/visualDescription）
 * 映射为 libs/temporal 的 AnalysisReport（含 scenes/asr/ocr/vlm）。
 *
 * 两个类型结构等价但字段命名不同，此处集中转换避免散落。
 */
import type {
  AnalysisReport,
  AsrResult,
  OcrResult,
  SceneSegment,
  VlmResult,
} from './types'

/**
 * 将 libs/ai 的 AnalysisReport 映射为 libs/temporal 的 AnalysisReport
 *
 * @param analyzerReport 来自 VideoAnalyzerService / LlmProvider 的分析结果
 * @param analysisMs 4 维度分析耗时（毫秒）
 * @param durationMs 可选，视频总时长（秒）；缺失时取最后一个镜头 endTime
 */
export function mapAnalyzerReportToTemporal(
  analyzerReport: import('@reelclone/ai').AnalysisReport,
  analysisMs: number,
): AnalysisReport {
  const { shots, transcript, ocr, visualDescription } = analyzerReport

  const scenes: SceneSegment[] = shots.map((s) => ({
    index: s.index,
    start: s.startTime,
    end: s.endTime,
    duration: s.duration,
    keyframePath: s.keyframeUrl,
    description: s.shotType,
  }))

  const asr: AsrResult = {
    transcript: transcript.map((t) => t.text).join(' '),
    segments: transcript.map((t) => ({
      start: t.startTime,
      end: t.endTime,
      text: t.text,
    })),
  }

  const ocrResult: OcrResult = {
    items: ocr.map((o) => ({
      timestamp: o.time,
      text: o.text,
      confidence: o.confidence ?? 0,
      box: o.bbox,
    })),
  }

  const vlm: VlmResult = {
    descriptions: visualDescription.map((v) => ({
      timestamp: v.time,
      description: v.description,
      sellingPoints: v.tags,
    })),
  }

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
