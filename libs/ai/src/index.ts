/**
 * @reelclone/ai 统一导出
 *
 * 包含：Seedance 视频 AI、LLM 适配、提示词引擎、视频下载器、
 * 视频分析器、FFmpeg 封装、内容安全审核。
 *
 * 所有 Provider / Service 均通过 NestJS @Injectable() 装饰，
 * 并在 AiModule 中统一注册与导出。
 */

// AI 模块
export { AiModule } from './ai.module'

// Seedance
export {
  SeedanceProvider,
  SeedanceValidationError,
  SeedanceNoAvailableKeyError,
} from './seedance/seedance.provider'
export {
  GenerationType,
  type SeedanceTaskParams,
  type SeedanceTaskStatus,
  type SeedanceTaskState,
  type SeedanceResult,
  type SeedanceSubmitResult,
  type VideoResolution,
  type VideoDuration,
} from './seedance/seedance.types'

// LLM
export { LlmProvider } from './llm/llm.provider'
export { PromptEngineService } from './llm/prompt-engine.service'
export { type CloneSuggestion, type StructuredReport } from './llm/prompt-engine.service'
export {
  validateLlmStructuredReport,
  type ValidationResult,
} from './llm/structured-report.validator'
export {
  sanitizePromptInput,
  sanitizePromptInputs,
  sanitizeAnalysisInputs,
} from './llm/prompt-sanitizer'
export {
  LlmProvider as LlmProviderEnum,
  type LlmMessage,
  type LlmRole,
  type LlmCompleteOptions,
  type CopyGenerationParams,
} from './llm/llm.types'

// 视频下载器
export { VideoDownloaderService } from './downloader/video-downloader.service'
export {
  VideoPlatform,
  type DownloadResult,
  type VideoMetadata,
} from './downloader/downloader.types'

// 视频分析器
export { VideoAnalyzerService } from './analyzer/video-analyzer.service'
export {
  type AnalysisReport,
  type AnalysisInputs,
  type ShotSegment,
  type TranscriptSegment,
  type OcrItem,
  type VisualDescriptionItem,
  type CloneableElements,
} from './analyzer/analyzer.types'

// FFmpeg
export { FfmpegService } from './ffmpeg/ffmpeg.service'
export {
  type TranscodeOptions,
  type VideoMetaInfo,
  type CompressionQuality,
} from './ffmpeg/ffmpeg.types'

// 内容安全审核
export { ModerationService, type ModerationResult } from './moderation/moderation.service'
