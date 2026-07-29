/**
 * 视频分析器类型定义
 */

/** 镜头切分结果 */
export interface ShotSegment {
  /** 镜头序号（从 1 开始） */
  index: number;
  /** 起始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 镜头时长（秒） */
  duration: number;
  /** 关键帧图片路径/URL */
  keyframeUrl?: string;
  /** 镜头类型描述，如「产品特写」「口播讲解」 */
  shotType?: string;
}

/** 语音识别（ASR）单条结果 */
export interface TranscriptSegment {
  /** 序号 */
  index: number;
  /** 起始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 识别文本 */
  text: string;
}

/** OCR 单条结果 */
export interface OcrItem {
  /** 序号 */
  index: number;
  /** 出现时间（秒） */
  time: number;
  /** 识别文本 */
  text: string;
  /** 文字区域坐标 [x, y, width, height] */
  bbox?: [number, number, number, number];
  /** 置信度 0-1 */
  confidence?: number;
}

/** 画面描述（VLM）单条结果 */
export interface VisualDescriptionItem {
  /** 序号 */
  index: number;
  /** 对应时间（秒） */
  time: number;
  /** 画面描述 */
  description: string;
  /** 提炼的卖点标签 */
  tags?: string[];
}

/** 可复用元素拆解 */
export interface CloneableElements {
  /** 镜头结构（可复用模板） */
  shotStructure: string[];
  /** 文案脚本（可改写） */
  copyScript: string;
  /** 视觉风格关键词 */
  visualStyle: string[];
  /** 节奏/时长建议 */
  pacing: string;
  /** BGM 类型建议 */
  bgmType?: string;
}

/** 对标解析输入（多源结果汇总输入） */
export interface AnalysisInputs {
  /** 镜头切分结果 */
  shots: ShotSegment[];
  /** 语音识别结果 */
  transcript: TranscriptSegment[];
  /** OCR 结果 */
  ocr: OcrItem[];
  /** 画面描述结果 */
  visualDescription: VisualDescriptionItem[];
}

/** 视频分析报告 */
export interface AnalysisReport {
  /** 视频整体风格，如「快节奏带货种草」 */
  style: string;
  /** 镜头切分列表 */
  shots: ShotSegment[];
  /** 语音识别结果（完整口播文案） */
  transcript: TranscriptSegment[];
  /** OCR 结果 */
  ocr: OcrItem[];
  /** 画面描述列表 */
  visualDescription: VisualDescriptionItem[];
  /** LLM 汇总的结构化摘要 */
  summary: string;
  /** 可复用元素（用于一键复刻） */
  cloneableElements: CloneableElements;
  /** 分析所用平台标识（Mock / 真实） */
  source: 'mock' | 'real';
  /** 分析时间（毫秒时间戳） */
  analyzedAt: number;
}
