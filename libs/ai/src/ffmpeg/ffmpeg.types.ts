/**
 * FFmpeg 服务类型定义
 */

/** 转码选项 */
export interface TranscodeOptions {
  /** 目标视频编码，如 libx264 / libx265 */
  videoCodec?: string;
  /** 目标音频编码，如 aac */
  audioCodec?: string;
  /** 视频码率，如 2M */
  videoBitrate?: string;
  /** 目标分辨率，如 1280x720 */
  resolution?: string;
  /** 帧率 */
  fps?: number;
  /** 额外 ffmpeg 参数 */
  extraArgs?: string[];
}

/** 视频元信息 */
export interface VideoMetaInfo {
  /** 时长（秒） */
  duration: number;
  /** 宽度（像素） */
  width: number;
  /** 高度（像素） */
  height: number;
  /** 视频码率（bps） */
  videoBitrate?: number;
  /** 音频码率（bps） */
  audioBitrate?: number;
  /** 视频编码 */
  videoCodec?: string;
  /** 音频编码 */
  audioCodec?: string;
  /** 帧率 */
  fps?: number;
  /** 文件大小（字节） */
  size?: number;
}

/** 压缩质量档位 */
export type CompressionQuality = 'low' | 'medium' | 'high';
