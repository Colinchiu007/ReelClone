/**
 * 积分计算工具
 *
 * P1-4 重构：内部使用 CapabilityRegistry 作为单一真相源，
 * 保留原有 calculatePoints / isVideoType 导出签名以减少改动量。
 *
 * 积分规则（来源于 @reelclone/capability DEFAULT_CAPABILITIES）：
 *  - 文本生成: 5 积分
 *  - 图片生成: 60 积分
 *  - 视频生成 - 480p 5s: 450 / 480p 10s: 900
 *  - 视频生成 - 720p 5s: 900 / 720p 10s: 1800
 *  - 视频生成 - 1080p 5s: 1800 / 1080p 10s: 3600
 *  - 3D 建模: 1800 积分
 *  - 编辑视频: 1500 积分
 *  - 延长视频: 1200 积分
 *  - 提示词反推: 5 积分
 *  - 提示词润色: 3 积分
 */
import { CapabilityRegistry, DEFAULT_CAPABILITIES, GenerationType } from '@reelclone/capability'

/** 视频分辨率 */
export type VideoResolution = '480p' | '720p' | '1080p'

/** 视频时长（秒） */
export type VideoDuration = 5 | 10

/** 单例注册表（进程内共享，不可变） */
const registry = new CapabilityRegistry(DEFAULT_CAPABILITIES)

/** 提示词类操作积分（非生成类型，不纳入 registry） */
export const PROMPT_POINTS = {
  REVERSE: 5,
  POLISH: 3,
} as const

/**
 * 计算生成任务消耗的积分
 *
 * @param type 生成类型
 * @param options 分辨率与时长（仅视频类生效）
 * @returns 消耗积分数量（正整数）
 */
export function calculatePoints(
  type: GenerationType,
  options?: { resolution?: VideoResolution; duration?: VideoDuration },
): number {
  return registry.calculatePoints(type, options)
}

/**
 * 判断生成类型是否为视频类
 */
export function isVideoType(type: GenerationType): boolean {
  return registry.isVideoType(type)
}
