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
 *   setActivityDependencies({ seedanceProvider: app.get(SeedanceProvider) })
 *
 *   // Activity 内部（真实模式）
 *   const { seedanceProvider } = getActivityDependencies()
 *   await seedanceProvider.submitTask(params)
 *
 * 仅 Activity 真实模式会调用 getActivityDependencies()，Mock 模式不依赖此容器。
 */
import type { SeedanceProvider } from '@reelclone/ai'

/** Activity 依赖集合（由 Worker 启动时注入，后续可扩展其他 provider） */
export interface ActivityDependencies {
  seedanceProvider: SeedanceProvider
  // 后续可扩展：ffmpegService、videoAnalyzerService、ossService 等
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
