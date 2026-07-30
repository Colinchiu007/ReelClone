/**
 * Activity 依赖容器
 *
 * Temporal Activity 运行在 Worker 进程中，无法直接访问 NestJS DI 容器。
 * 通过全局容器模式：Worker 启动时（在 NestJS bootstrap 中）由调用方注入
 * 已构造好的 Provider 实例，Activity 执行时通过 getActivityDependencies() 取用。
 *
 * 使用方式：
 *   // Worker 启动时（bootstrapWorker，可访问 NestJS app）
 *   import { setActivityDependencies } from '@reelclone/temporal'
 *   setActivityDependencies({
 *     seedanceProvider: app.get(SeedanceProvider),
 *     videoDownloader: app.get(VideoDownloaderService),
 *     videoAnalyzer: app.get(VideoAnalyzerService),
 *     ffmpegService: app.get(FfmpegService),
 *     llmProvider: app.get(LlmProvider),
 *     ossService: app.get(OSSService),
 *   })
 *
 *   // Activity 内部（真实模式）
 *   const { seedanceProvider } = getActivityDependencies()
 *   await seedanceProvider.submitTask(params)
 *
 * 仅 Activity 真实模式会调用 getActivityDependencies()，Mock 模式不依赖此容器。
 */
import type {
  FfmpegService,
  LlmProvider,
  SeedanceProvider,
  VideoAnalyzerService,
  VideoDownloaderService,
} from '@reelclone/ai'
import type { OSSService } from '@reelclone/oss'

/** Activity 依赖集合（由 Worker 启动时注入） */
export interface ActivityDependencies {
  /** Seedance 视频生成 Provider */
  seedanceProvider: SeedanceProvider
  /** 视频下载器（抖音/小红书/B 站等） */
  videoDownloader: VideoDownloaderService
  /** 视频分析器（场景/ASR/OCR/VLM 4 维度） */
  videoAnalyzer: VideoAnalyzerService
  /** FFmpeg 封装（转码/压缩/封面） */
  ffmpegService: FfmpegService
  /** LLM 大模型（用于对标解析汇总） */
  llmProvider: LlmProvider
  /** OSS 对象存储（上传/下载/签名 URL） */
  ossService: OSSService
}

/** 当前注入的依赖（Worker 启动前为 null） */
let deps: ActivityDependencies | null = null

/**
 * 注入 Activity 依赖
 *
 * 应在 startWorker 之前调用，确保 Activity 执行时依赖已就绪。
 * @param d 依赖集合
 */
export function setActivityDependencies(d: ActivityDependencies): void {
  deps = d
}

/**
 * 获取 Activity 依赖
 *
 * Activity 真实模式下调用。若未注入则抛出明确错误，提示调用方先注入。
 * @returns 依赖集合
 */
export function getActivityDependencies(): ActivityDependencies {
  if (!deps) {
    throw new Error(
      'Activity dependencies not set. Call setActivityDependencies() before starting Worker.',
    )
  }
  return deps
}
