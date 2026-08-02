/**
 * 积分计算工具
 *
 * P1-4 重构：函数签名接受 CapabilityRegistry 参数（由 NestJS DI 注入），
 * 不再自行创建实例（P1-4 评审修复 P0-1：统一单实例）。
 *
 * 积分规则由 @reelclone/capability DEFAULT_CAPABILITIES 定义。
 */
import { CapabilityRegistry, GenerationType } from '@reelclone/capability'

/** 提示词反推积分（非生成类型，不纳入 registry） */
export const PROMPT_REVERSE_POINTS = 5

/** 提示词润色积分（非生成类型，不纳入 registry） */
export const PROMPT_POLISH_POINTS = 3

/**
 * 计算生成任务消耗的积分
 *
 * @param registry 能力注册表（由 NestJS DI 注入）
 * @param type 生成类型
 * @param options 分辨率与时长（仅视频类生效）
 * @returns 消耗积分数量（正整数）
 */
export function calculatePoints(
  registry: CapabilityRegistry,
  type: GenerationType,
  options?: { resolution?: string; duration?: number },
): number {
  return registry.calculatePoints(type, options)
}

/**
 * 判断生成类型是否为视频类
 *
 * @param registry 能力注册表（由 NestJS DI 注入）
 */
export function isVideoType(registry: CapabilityRegistry, type: GenerationType): boolean {
  return registry.isVideoType(type)
}
