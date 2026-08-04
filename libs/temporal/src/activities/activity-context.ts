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
import type { WorkStatus, StructuredReport } from '../types'

/** LLM 结构化报告校验结果（避免 temporal 运行时依赖 @reelclone/ai） */
export interface LlmStructuredValidationResult {
  valid: boolean
  report: Partial<StructuredReport>
  errors: string[]
}

/** 内容安全审核最小接口（避免 temporal 运行时依赖 @reelclone/ai） */
export interface ModerationServiceContract {
  moderateText(
    key: string,
  ): Promise<{ passed: boolean; reason?: string; hitKeywords?: string[] }>
}

/** 通用实体 Repository 最小接口（避免 temporal 直接依赖 database 实体类型） */
export interface EntityRepository {
  update(criteria: unknown, partial: unknown): Promise<unknown>
  find(options?: unknown): Promise<unknown[]>
  findOne(options?: unknown): Promise<unknown | null>
  createQueryBuilder(alias?: string): unknown
}

/** Worker 侧 Work/Task 状态写入边界。 */
export interface WorkflowStateStore {
  updateWorkStatus(
    workId: string,
    status: WorkStatus,
    data?: Record<string, unknown>,
    generationTaskId?: string,
  ): Promise<boolean>
}

/** Worker 侧 Redis 发布边界。 */
export interface EventPublisher {
  publish(channel: string, message: string): Promise<number>
}

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
  /** Work/GenerationTask 状态写入适配 */
  workflowStateStore: WorkflowStateStore
  /** Redis Pub/Sub 发布器 */
  eventPublisher: EventPublisher
  /** 内容安全审核（关键词过滤，原 @reelclone/ai.ModerationService） */
  moderationService: ModerationServiceContract
  /** LLM 输出字段级校验器（原 @reelclone/ai.validateLlmStructuredReport） */
  validateLlmStructuredReport: (raw: unknown) => LlmStructuredValidationResult
  /** Prompt Injection 脱敏函数（原 @reelclone/ai.sanitizePromptInput） */
  sanitizePromptInput: (input: unknown) => string
  /** C5: GenerationExecution 仓库（Reconciler 用） */
  executionRepo?: EntityRepository
  /** C5: GenerationWork 仓库（Reconciler 用） */
  workRepo?: EntityRepository
  /** C5: Provider 查询适配器 — 按 providerName 查询任务状态 */
  providerQuery?: (
    providerName: string,
    taskId: string,
  ) => Promise<{ status: string; videoUrl?: string; errorMessage?: string }>
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
