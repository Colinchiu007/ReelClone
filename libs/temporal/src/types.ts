/**
 * @reelclone/temporal 类型定义
 * 工作流参数、返回值、Activity 接口、状态枚举等
 */
import type { VideoMetaInfo } from '@reelclone/ai'

// ============================================================
// 通用枚举
// ============================================================

/** Work 业务状态 */
export enum WorkStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELED = 'canceled',
}

/** Benchmark 业务状态 */
export enum BenchmarkStatus {
  PENDING = 'pending',
  ANALYZING = 'analyzing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Seedance 任务状态 */
export enum SeedanceTaskStatus {
  SUBMITTED = 'submitted',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  UNKNOWN = 'unknown',
}

/** 视频生成类型 */
export enum WorkType {
  TEXT_TO_VIDEO = 'text_to_video',
  IMAGE_TO_VIDEO = 'image_to_video',
  IMAGE_TO_VIDEO_WITH_TAIL = 'image_to_video_with_tail',
  EDIT_VIDEO = 'edit_video',
  EXTEND_VIDEO = 'extend_video',
  REFERENCE_TO_VIDEO = 'reference_to_video',
}

/** 内容安全审核结果 */
export enum ModerationDecision {
  PASSED = 'passed',
  REJECTED = 'rejected',
  REVIEW = 'review',
}

/** 通知类型 */
export enum NotificationType {
  WORK_COMPLETED = 'work_completed',
  WORK_FAILED = 'work_failed',
  WORK_TIMEOUT = 'work_timeout',
  BENCHMARK_COMPLETED = 'benchmark_completed',
  BENCHMARK_FAILED = 'benchmark_failed',
}

// ============================================================
// 视频生成工作流类型
// ============================================================

/** 视频模型参数 */
export interface VideoModelConfig {
  /** 模型 ID（如 seedance-1-pro） */
  modelId: string
  /** 视频时长（秒），通常 5/10 */
  duration: number
  /** 分辨率（如 720p / 1080p） */
  resolution: string
  /** 宽高比（如 16:9 / 9:16） */
  aspectRatio: string
  /** 采样种子，可选 */
  seed?: number
  /** 是否启用负向提示词 */
  negativePrompt?: string
  /** 首帧图 URL（图生视频） */
  firstFrameUrl?: string
  /** 尾帧图 URL（首尾帧生视频） */
  lastFrameUrl?: string
  /** 参考图 URL（参考生视频 / 3D 建模） */
  referenceUrl?: string
}

/** 视频生成工作流入参 */
export interface VideoGenParams {
  /** Work 记录 ID */
  workId: string
  /** 用户 ID */
  userId: string
  /** 生成类型 */
  workType: WorkType
  /** 提示词 */
  prompt: string
  /** 模型参数 */
  modelConfig: VideoModelConfig
  /** 预估消耗积分（提交时冻结） */
  estimatedCredits: number
  /** 幂等键（贯穿所有计费操作） */
  idempotencyKey: string
  /** 模板 ID（可选，从模板套用） */
  templateId?: string
  /** 对标解析 ID（可选，从对标克隆） */
  benchmarkId?: string
  /** 是否启用内容安全审核 */
  enableModeration?: boolean
}

/** 视频生成工作流返回值 */
export interface VideoGenResult {
  /** Work 记录 ID */
  workId: string
  /** 最终业务状态 */
  status: WorkStatus
  /** 成品视频 URL（成功时返回） */
  resultUrl?: string
  /** 成品视频 OSS Key */
  resultKey?: string
  /** 封面图 URL */
  coverUrl?: string
  /** 实际消耗积分 */
  consumedCredits: number
  /** 失败原因（失败/超时时返回） */
  error?: string
  /** Seedance 任务 ID */
  providerTaskId?: string
  /** 工作流执行耗时（毫秒） */
  durationMs: number
}

// ============================================================
// 对标解析工作流类型
// ============================================================

/** 对标解析工作流入参 */
export interface BenchmarkParams {
  /** Benchmark 记录 ID */
  benchmarkId: string
  /** 用户 ID */
  userId: string
  /** 源视频 URL */
  sourceUrl: string
  /** 平台标识（douyin/kuaishou/xhs/bilibili/wechat） */
  platform: string
  /** 幂等键 */
  idempotencyKey: string
  /** 是否启用深度分析 */
  deepAnalysis?: boolean
}

/** 场景切分结果 */
export interface SceneSegment {
  /** 场景序号 */
  index: number
  /** 起始时间（秒） */
  start: number
  /** 结束时间（秒） */
  end: number
  /** 时长（秒） */
  duration: number
  /** 关键帧本地路径 */
  keyframePath?: string
  /** 场景描述 */
  description?: string
}

/** ASR 语音识别结果 */
export interface AsrResult {
  /** 完整口播文本 */
  transcript: string
  /** 分段时间戳 */
  segments: Array<{
    start: number
    end: number
    text: string
  }>
}

/** OCR 画面文字识别结果 */
export interface OcrResult {
  /** 识别到的文字项 */
  items: Array<{
    timestamp: number
    text: string
    confidence: number
    box?: [number, number, number, number]
  }>
}

/** VLM 画面描述结果 */
export interface VlmResult {
  /** 关键帧画面描述 */
  descriptions: Array<{
    timestamp: number
    description: string
    sellingPoints?: string[]
  }>
}

/** 视频分析报告（4 维度原始结果） */
export interface AnalysisReport {
  /** 视频总时长（秒） */
  duration: number
  /** 场景切分结果 */
  scenes: SceneSegment[]
  /** 语音识别结果 */
  asr: AsrResult
  /** OCR 识别结果 */
  ocr: OcrResult
  /** VLM 画面描述结果 */
  vlm: VlmResult
  /** 分析耗时（毫秒） */
  analysisMs: number
}

/** 结构化对标解析报告（LLM 汇总后） */
export interface StructuredReport {
  /** 视频整体风格 */
  style: string
  /** 节奏分析 */
  pacing: string
  /** 镜头脚本 */
  shotList: Array<{
    sceneIndex: number
    duration: number
    visual: string
    voiceover: string
    onScreenText: string
  }>
  /** 文案拆解 */
  copywriting: {
    hook: string
    body: string
    cta: string
  }
  /** 卖点提炼 */
  sellingPoints: string[]
  /** 可复用模板建议 */
  templateSuggestion: string
  /** LLM 汇总耗时（毫秒） */
  summaryMs: number
}

/** 对标解析工作流返回值 */
export interface BenchmarkResult {
  /** Benchmark 记录 ID */
  benchmarkId: string
  /** 最终业务状态 */
  status: BenchmarkStatus
  /** 原始分析报告 */
  analysisReport?: AnalysisReport
  /** 结构化报告（LLM 汇总） */
  structuredReport?: StructuredReport
  /** 实际消耗积分 */
  consumedCredits: number
  /** 失败原因 */
  error?: string
  /** 工作流执行耗时（毫秒） */
  durationMs: number
}

// ============================================================
// 用户上传视频转模板工作流类型
// ============================================================

/** 模板生成工作流入参 */
export interface TemplateGenerationInput {
  /** 模板 ID */
  templateId: string
  /** 用户 ID */
  userId: string
  /** 视频在 OSS 中的 Key */
  ossKey: string
  /** 模板标题 */
  title: string
}

/** 模板生成工作流返回值 */
export interface TemplateGenerationResult {
  /** 模板 ID */
  templateId: string
  /** 最终状态：ACTIVE（成功）/ ANALYSIS_FAILED（失败） */
  status: 'ACTIVE' | 'ANALYSIS_FAILED'
  /** 失败原因（失败时返回） */
  failureReason?: string
}

// ============================================================
// Activity 接口契约（用于 proxyActivities 类型推导）
// ============================================================

/** Seedance Activity 接口 */
export interface SeedanceActivities {
  /** 提交任务到 Seedance，返回 Provider 任务 ID */
  submitToSeedance(params: VideoGenParams): Promise<string>
  /** 查询 Seedance 任务状态 */
  querySeedanceTask(taskId: string): Promise<{
    status: SeedanceTaskStatus
    videoUrl?: string
    errorMessage?: string
  }>
  /** 取消 Seedance 任务 */
  cancelSeedanceTask(taskId: string): Promise<boolean>
}

/** 计费 Activity 接口 */
export interface BillingActivities {
  /** 冻结积分（提交任务时） */
  freezeCredits(userId: string, amount: number, idempotencyKey: string): Promise<boolean>
  /** 结算积分（任务成功，按实际用量） */
  settleCredits(
    userId: string,
    workId: string,
    actualCost: number,
    idempotencyKey: string,
  ): Promise<boolean>
  /** 释放积分（任务失败/取消） */
  releaseCredits(userId: string, workId: string, idempotencyKey: string): Promise<boolean>
}

/** 媒体处理 Activity 接口 */
export interface MediaActivities {
  /** 下载视频到本地 */
  downloadVideo(url: string): Promise<string>
  /** FFmpeg 后处理（转码/压缩/水印），返回 OSS Key */
  postProcessVideo(videoUrl: string, config: PostProcessConfig): Promise<string>
  /** 生成封面缩略图，返回 OSS Key */
  generateThumbnail(videoPath: string): Promise<string>
  /** 内容安全审核 */
  moderateContent(videoKey: string, thumbnailKey: string): Promise<ModerationResult>
}

/** FFmpeg 后处理配置 */
export interface PostProcessConfig {
  /** 目标编码（h264/h265） */
  codec?: string
  /** 目标分辨率 */
  resolution?: string
  /** 码率 */
  bitrate?: string
  /** 是否添加水印 */
  watermark?: string
  /** 输出格式 */
  format?: string
}

/** 内容安全审核结果 */
export interface ModerationResult {
  passed: boolean
  decision: ModerationDecision
  reason?: string
  /** 命中的风险标签 */
  labels?: string[]
}

/** 分析 Activity 接口 */
export interface AnalyzerActivities {
  /** 下载对标视频到本地 */
  downloadBenchmarkVideo(url: string): Promise<string>
  /** 视频分析（内部并行执行 4 维度：场景/ASR/OCR/VLM） */
  analyzeVideo(videoPath: string): Promise<AnalysisReport>
  /** LLM 汇总为结构化报告 */
  summarizeReport(report: AnalysisReport): Promise<StructuredReport>
}

/** 通知 Activity 接口 */
export interface NotificationActivities {
  /** 更新 Work 业务状态 */
  updateWorkStatus(
    workId: string,
    status: WorkStatus,
    data?: Record<string, unknown>,
  ): Promise<boolean>
  /** 更新 Benchmark 业务状态 */
  updateBenchmarkStatus(
    benchmarkId: string,
    status: BenchmarkStatus,
    data?: Record<string, unknown>,
  ): Promise<boolean>
  /** 通过 Redis Pub/Sub 推送事件给用户 */
  notifyUser(
    userId: string,
    type: NotificationType,
    data: Record<string, unknown>,
  ): Promise<boolean>
  /** 发送微信订阅消息 */
  sendSubscribeMessage(
    userId: string,
    templateId: string,
    data: Record<string, unknown>,
  ): Promise<boolean>
}

/** OSS Activity 接口 */
export interface OssActivities {
  /** 上传本地文件到 OSS，返回访问 URL */
  uploadToOSS(localPath: string, key: string): Promise<string>
  /** 生成签名 URL（默认 15 分钟有效） */
  generateSignedUrl(key: string): Promise<string>
}

/** 模板生成 Activity 接口（用户上传视频转模板） */
export interface TemplateActivities {
  /** 从 OSS 下载视频到本地临时目录 */
  downloadAssetVideo(ossKey: string): Promise<string>
  /** 提取视频元数据（分辨率/时长/编码） */
  extractVideoMeta(videoPath: string): Promise<VideoMetaInfo>
  /** 截取封面（第 1 秒），返回本地封面文件路径 */
  generateTemplateThumbnail(videoPath: string): Promise<string>
  /** 视频分析（4 维度：场景/ASR/OCR/VLM） */
  analyzeTemplateVideo(videoPath: string): Promise<AnalysisReport>
  /** LLM 生成模板建议 */
  summarizeTemplate(report: AnalysisReport): Promise<StructuredReport>
  /** 上传封面到 OSS，返回 coverKey */
  uploadThumbnail(params: {
    thumbnailPath: string
    userId: string
    templateId: string
  }): Promise<string>
  /** 完成模板：更新 Template 状态为 ACTIVE */
  finalizeTemplate(params: {
    templateId: string
    meta: VideoMetaInfo
    analysisReport: AnalysisReport
    templateSuggestion: StructuredReport
    coverKey: string
  }): Promise<void>
  /** 标记模板失败：更新 Template 状态为 ANALYSIS_FAILED */
  markTemplateFailed(params: { templateId: string; reason: string }): Promise<void>
}

// ============================================================
// Temporal 元信息
// ============================================================

/** 工作流 Task Queue 名称 */
const DEFAULT_TASK_QUEUE = 'reelclone-tasks'

export const TASK_QUEUE = {
  /** 视频生成队列 */
  VIDEO_GENERATION: DEFAULT_TASK_QUEUE,
  /** 对标解析队列 */
  BENCHMARK_ANALYSIS: DEFAULT_TASK_QUEUE,
  /** 模板生成队列（用户上传视频转模板） */
  TEMPLATE_GENERATION: DEFAULT_TASK_QUEUE,
  /** 默认队列 */
  DEFAULT: DEFAULT_TASK_QUEUE,
} as const

/** 工作流 ID 前缀 */
export const WORKFLOW_ID_PREFIX = {
  VIDEO_GEN: 'video-gen',
  BENCHMARK: 'benchmark',
  TEMPLATE: 'template',
} as const

/** 视频生成轮询配置 */
export const VIDEO_POLLING_CONFIG = {
  /** 轮询间隔（毫秒） */
  INTERVAL_MS: 5_000,
  /** 最大轮询次数（120 次 × 5s = 10 分钟） */
  MAX_ATTEMPTS: 120,
} as const
