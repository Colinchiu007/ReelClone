/**
 * FFmpeg 服务类型定义
 */

/** 转码选项 */
export interface TranscodeOptions {
  /** 目标视频编码，如 libx264 / libx265 */
  videoCodec?: string
  /** 目标音频编码，如 aac */
  audioCodec?: string
  /** 视频码率，如 2M */
  videoBitrate?: string
  /** 目标分辨率，如 1280x720 */
  resolution?: string
  /** 帧率 */
  fps?: number
  /** 额外 ffmpeg 参数 */
  extraArgs?: string[]
}

// VideoMetaInfo 已迁移至 @reelclone/common，此处 re-export 保持向后兼容
export type { VideoMetaInfo } from '@reelclone/common'

/** 压缩质量档位 */
export type CompressionQuality = 'low' | 'medium' | 'high'
