/**
 * @reelclone/temporal
 *
 * ReelClone Temporal 工作流库入口
 * 导出所有工作流、Activity、Client、Worker、类型与 NestJS 模块
 */

// ============================================================
// 类型与枚举
// ============================================================
export * from './types'

// ============================================================
// 错误分类体系
// ============================================================
export {
  TemporalError,
  ProviderCancellationPendingError,
  ProviderStateUnknownError,
  BillingError,
  ModerationRejectedError,
  ActivityTransientError,
} from './errors'

// ============================================================
// 重试策略
// ============================================================
export {
  NON_RETRYABLE_ERROR_TYPES,
  VIDEO_GENERATION_RETRY,
  BENCHMARK_ANALYSIS_RETRY,
  TEMPLATE_GENERATION_RETRY,
  RECONCILER_RETRY,
} from './retry-policies'

// ============================================================
// 共享映射函数
// ============================================================
export { mapAnalyzerReportToTemporal } from './mappers'

// ============================================================
// NestJS 模块与服务
// ============================================================
export { TemporalModule } from './temporal.module'
export type { TemporalModuleOptions, TemporalModuleAsyncOptions } from './temporal.module'
export { TEMPORAL_OPTIONS } from './temporal.module'
export { TemporalService } from './temporal.service'

// ============================================================
// Temporal Client（供非 NestJS 场景直接使用）
// ============================================================
export {
  getClient,
  closeClient,
  startVideoGenerationWorkflow,
  startBenchmarkAnalysisWorkflow,
  getWorkflowStatus,
  cancelWorkflow,
} from './client/temporal.client'
export type { TemporalClientConfig } from './client/temporal.client'

// ============================================================
// Temporal Worker
// ============================================================
export { startWorker, stopWorker, allActivities } from './worker/temporal.worker'
export type { TemporalWorkerConfig } from './worker/temporal.worker'

// ============================================================
// Activity 依赖容器（Worker 启动时注入 NestJS Provider 实例）
// ============================================================
export {
  setActivityDependencies,
  getActivityDependencies,
  type ActivityDependencies,
  type EventPublisher,
  type WorkflowStateStore,
  type EntityRepository,
  type ModerationServiceContract,
  type LlmStructuredValidationResult,
} from './activities/activity-context'

// ============================================================
// 工作流定义（供 Worker 注册与外部引用）
// ============================================================
export { videoGenerationWorkflow } from './workflows/video-generation.workflow'
export { benchmarkAnalysisWorkflow } from './workflows/benchmark-analysis.workflow'
export { templateGenerationWorkflow } from './workflows/template-generation.workflow'
/** C5: GenerationExecution Reconciler 工作流 */
export { generationReconcilerWorkflow } from './workflows/generation-reconciler.workflow'

// ============================================================
// Activity 实现集合（供 Worker 注册）
// ============================================================
export { seedanceActivities } from './activities/seedance.activities'
export { billingActivities } from './activities/billing.activities'
export { mediaActivities } from './activities/media.activities'
export { analyzerActivities } from './activities/analyzer.activities'
export { notificationActivities } from './activities/notification.activities'
export { ossActivities } from './activities/oss.activities'
export { templateActivities } from './activities/template.activities'
/** C5: Reconciler Activities */
export { reconcilerActivities } from './activities/reconciler.activities'
export {
  scanPendingExecutions,
  claimExecution,
  queryProviderTaskStatus,
  updateExecutionStage,
  releaseClaim,
} from './activities/reconciler.activities'

// ============================================================
// Activity 个别函数（供测试或直接调用）
// ============================================================
export {
  submitToSeedance,
  querySeedanceTask,
  cancelSeedanceTask,
} from './activities/seedance.activities'
export { freezeCredits, settleCredits, releaseCredits } from './activities/billing.activities'
export {
  downloadVideo,
  postProcessVideo,
  generateThumbnail,
  moderateContent,
} from './activities/media.activities'
export {
  downloadBenchmarkVideo,
  analyzeVideo,
  summarizeReport,
} from './activities/analyzer.activities'
export {
  updateWorkStatus,
  updateBenchmarkStatus,
  notifyUser,
  sendSubscribeMessage,
} from './activities/notification.activities'
export { uploadToOSS, generateSignedUrl } from './activities/oss.activities'
export {
  downloadAssetVideo,
  extractVideoMeta,
  generateTemplateThumbnail,
  analyzeTemplateVideo,
  summarizeTemplate,
  uploadThumbnail,
  finalizeTemplate,
  markTemplateFailed,
} from './activities/template.activities'
