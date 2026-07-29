/**
 * Seedance 视频 AI 类型定义
 */

/**
 * 视频生成类型枚举
 * - TEXT_TO_VIDEO: 文生视频
 * - IMAGE_TO_VIDEO_FIRST_FRAME: 图生视频（首帧）
 * - IMAGE_TO_VIDEO_FIRST_LAST_FRAME: 图生视频（首尾帧）
 * - EDIT_VIDEO: 编辑视频
 * - EXTEND_VIDEO: 延长视频
 */
export enum GenerationType {
  TEXT_TO_VIDEO = 'TEXT_TO_VIDEO',
  IMAGE_TO_VIDEO_FIRST_FRAME = 'IMAGE_TO_VIDEO_FIRST_FRAME',
  IMAGE_TO_VIDEO_FIRST_LAST_FRAME = 'IMAGE_TO_VIDEO_FIRST_LAST_FRAME',
  EDIT_VIDEO = 'EDIT_VIDEO',
  EXTEND_VIDEO = 'EXTEND_VIDEO',
}

/** 视频分辨率档位 */
export type VideoResolution = '480p' | '720p' | '1080p' | '4k';

/** 视频时长（秒） */
export type VideoDuration = 5 | 10;

/** 生成任务提交参数 */
export interface SeedanceTaskParams {
  /** 生成类型 */
  type: GenerationType;
  /** 提示词（文生视频必填；图生/编辑/延长可为空但推荐填写） */
  prompt?: string;
  /** 首帧图片 URL（IMAGE_TO_VIDEO_FIRST_FRAME / IMAGE_TO_VIDEO_FIRST_LAST_FRAME 必填） */
  firstFrameUrl?: string;
  /** 尾帧图片 URL（IMAGE_TO_VIDEO_FIRST_LAST_FRAME 必填） */
  lastFrameUrl?: string;
  /** 待编辑视频 URL（EDIT_VIDEO 必填） */
  videoUrl?: string;
  /** 待延长视频 URL（EXTEND_VIDEO 必填） */
  sourceVideoUrl?: string;
  /** 分辨率，默认 720p */
  resolution?: VideoResolution;
  /** 时长，默认 5s */
  duration?: VideoDuration;
  /** 随机种子，不传由服务端生成 */
  seed?: number;
  /** 水印开关，默认关闭 */
  watermark?: boolean;
  /** 业务幂等键，用于防止重复提交 */
  idempotentKey?: string;
}

/** 生成结果 */
export interface SeedanceResult {
  /** 视频 URL */
  videoUrl: string;
  /** 封面图 URL */
  coverUrl?: string;
  /** 实际时长（秒） */
  duration?: number;
  /** 实际分辨率 */
  resolution?: VideoResolution;
  /** 视频体积（字节） */
  size?: number;
}

/** 任务状态枚举 */
export type SeedanceTaskState =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED';

/** 任务查询状态 */
export interface SeedanceTaskStatus {
  /** 任务 ID */
  taskId: string;
  /** 任务状态 */
  status: SeedanceTaskState;
  /** 进度百分比（0-100），仅 PROCESSING 阶段有意义 */
  progress?: number;
  /** 生成结果，SUCCEEDED 时有值 */
  result?: SeedanceResult;
  /** 失败原因，FAILED 时有值 */
  error?: string;
  /** 创建时间（毫秒时间戳） */
  createdAt?: number;
  /** 完成时间（毫秒时间戳） */
  completedAt?: number;
}

/** Seedance 提交任务返回 */
export interface SeedanceSubmitResult {
  /** 任务 ID */
  taskId: string;
  /** 当前使用的 API Key 序号（Mock 模式为 -1） */
  keyIndex: number;
}
