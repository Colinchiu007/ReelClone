/**
 * 能力配置工具（P1-4）
 *
 * 从 @reelclone/capability 导入单一真相源，
 * 提供给前端页面使用的常量和工具函数。
 *
 * 消除各页面的 POINTS_TABLE / MODELS / RESOLUTIONS / ASPECT_RATIOS / DURATIONS 硬编码。
 */
import { CapabilityRegistry, DEFAULT_CAPABILITIES, GenerationType } from '@reelclone/capability'

/** 单例注册表 */
const registry = new CapabilityRegistry(DEFAULT_CAPABILITIES)

// ============================================================
// 导出枚举（供页面组件使用）
// ============================================================
export { GenerationType }

// ============================================================
// 预计算查找表
// ============================================================

/**
 * 所有视频类型的积分表（预计算，避免每次调用 getPointsTable）。
 *
 * 前端为静态单例，不支持运行时价格热更新。
 * 如需热更新，需后端提供 /capabilities API。
 */
export const VIDEO_POINTS_TABLES: Record<string, Record<string, number>> = {}
for (const type of Object.values(GenerationType)) {
  const table = registry.getPointsTable(type as GenerationType)
  if (Object.keys(table).length > 0) {
    VIDEO_POINTS_TABLES[type] = table
  }
}

// ============================================================
// 视频类型页面共用常量
// ============================================================

/** 获取指定视频类型的积分表（resolution_duration → points） */
export function getPointsTable(type: GenerationType): Record<string, number> {
  return registry.getPointsTable(type)
}

/** 计算积分 */
export function calculatePoints(
  type: GenerationType,
  options?: { resolution?: string; duration?: number },
): number {
  return registry.calculatePoints(type, options)
}

/** 获取固定积分（非视频类型） */
export function getFixedPoints(type: GenerationType): number | undefined {
  return registry.getFixedPoints(type)
}

/** 获取可选分辨率列表 */
export function getResolutions(type: GenerationType): string[] {
  return registry.getUIConfig(type)?.resolutions ?? []
}

/** 获取可选宽高比列表 */
export function getAspectRatios(type: GenerationType): string[] {
  return registry.getUIConfig(type)?.aspectRatios ?? []
}

/** 获取可选时长列表 */
export function getDurations(type: GenerationType): number[] {
  return registry.getUIConfig(type)?.durations ?? []
}

/** 获取模型选项列表 */
export function getModels(type: GenerationType): { value: string; label: string }[] {
  return registry.getModels(type)
}

/** 获取最大提示词长度 */
export function getMaxPromptLength(type: GenerationType): number {
  return registry.getMaxPromptLength(type)
}

/** 获取默认值 */
export function getDefaults(type: GenerationType): Record<string, unknown> {
  return registry.getDefaults(type)
}
