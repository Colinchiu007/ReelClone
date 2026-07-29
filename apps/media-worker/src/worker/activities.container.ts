/**
 * Activity 容器
 *
 * 装配所有 Activity 实现（来自 @reelclone/temporal），供 Worker 注册使用。
 *
 * 当前 libs/temporal 中的 Activity 为独立函数（由 TEMPORAL_MOCK_MODE 控制 Mock 行为），
 * 这里将 6 组 Activity 聚合为单一对象，便于：
 *   1. 在 Worker 启动时统一注册
 *   2. 单元测试验证所有 Activity 已正确绑定
 *   3. 后续切换为真实 Provider 时，可在装配层注入 SeedanceProvider / FfmpegService 等
 *
 * Activity 分组：
 *   - seedance      视频 AI 提交 / 查询 / 取消
 *   - billing       积分冻结 / 结算 / 释放
 *   - media         视频下载 / FFmpeg 后处理 / 封面生成 / 内容审核
 *   - analyzer      对标视频下载 / 4 维度分析 / LLM 汇总
 *   - notification  Work / Benchmark 状态更新 / Redis 推送 / 微信订阅消息
 *   - oss           上传 / 签名 URL
 */
import {
  seedanceActivities,
  billingActivities,
  mediaActivities,
  analyzerActivities,
  notificationActivities,
  ossActivities,
} from '@reelclone/temporal'

/** 所有 Activity 名称清单（用于校验装配完整性） */
export const ACTIVITY_NAMES = [
  // seedance
  'submitToSeedance',
  'querySeedanceTask',
  'cancelSeedanceTask',
  // billing
  'freezeCredits',
  'settleCredits',
  'releaseCredits',
  // media
  'downloadVideo',
  'postProcessVideo',
  'generateThumbnail',
  'moderateContent',
  // analyzer
  'downloadBenchmarkVideo',
  'analyzeVideo',
  'summarizeReport',
  // notification
  'updateWorkStatus',
  'updateBenchmarkStatus',
  'notifyUser',
  'sendSubscribeMessage',
  // oss
  'uploadToOSS',
  'generateSignedUrl',
] as const

/**
 * 装配所有 Activity 实现并返回聚合对象
 *
 * @returns 包含全部 Activity 函数的对象，key 为 Activity 名称
 */
export function buildActivities() {
  return {
    ...seedanceActivities,
    ...billingActivities,
    ...mediaActivities,
    ...analyzerActivities,
    ...notificationActivities,
    ...ossActivities,
  }
}
