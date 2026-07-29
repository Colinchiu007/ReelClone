/**
 * 积分计算工具
 *
 * 根据生成类型、分辨率、时长计算任务消耗的积分。
 * 视频生成积分 = 分辨率档位 × 时长档位；
 * 其他类型为固定积分。
 *
 * 积分规则：
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
import { GenerationType } from './dto/create-generation.dto';

/** 视频分辨率 */
export type VideoResolution = '480p' | '720p' | '1080p';

/** 视频时长（秒） */
export type VideoDuration = 5 | 10;

/** 视频生成积分基础表（单次 5 秒） */
const VIDEO_POINTS_BASE: Record<VideoResolution, number> = {
  '480p': 450,
  '720p': 900,
  '1080p': 1800,
};

/** 固定积分表 */
const FIXED_POINTS: Partial<Record<GenerationType, number>> = {
  [GenerationType.TEXT_GENERATE]: 5,
  [GenerationType.IMAGE_GENERATE]: 60,
  [GenerationType.THREE_D_MODELING]: 1800,
  [GenerationType.EDIT_VIDEO]: 1500,
  [GenerationType.EXTEND_VIDEO]: 1200,
};

/** 提示词类操作积分 */
export const PROMPT_POINTS = {
  REVERSE: 5,
  POLISH: 3,
} as const;

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
  // 视频类生成：按分辨率 × 时长档位
  if (
    type === GenerationType.TEXT_TO_VIDEO ||
    type === GenerationType.IMAGE_TO_VIDEO_FIRST ||
    type === GenerationType.IMAGE_TO_VIDEO_FIRST_LAST
  ) {
    const resolution = options?.resolution ?? '720p';
    const duration = options?.duration ?? 5;
    const base = VIDEO_POINTS_BASE[resolution] ?? VIDEO_POINTS_BASE['720p'];
    // 10 秒为 5 积分的 2 倍
    return duration === 10 ? base * 2 : base;
  }

  // 固定积分类型
  const fixed = FIXED_POINTS[type];
  if (fixed !== undefined) {
    return fixed;
  }

  // 默认兜底（不应到达）
  return 0;
}

/**
 * 判断生成类型是否为视频类
 */
export function isVideoType(type: GenerationType): boolean {
  return (
    type === GenerationType.TEXT_TO_VIDEO ||
    type === GenerationType.IMAGE_TO_VIDEO_FIRST ||
    type === GenerationType.IMAGE_TO_VIDEO_FIRST_LAST ||
    type === GenerationType.THREE_D_MODELING ||
    type === GenerationType.EDIT_VIDEO ||
    type === GenerationType.EXTEND_VIDEO
  );
}
