/**
 * 视频元信息（跨包共享类型）
 *
 * 从 @reelclone/ai 提取到 @reelclone/common，
 * 消除 temporal → ai 的类型耦合。
 */
export interface VideoMetaInfo {
  /** 时长（秒） */
  duration: number
  /** 宽度（像素） */
  width: number
  /** 高度（像素） */
  height: number
  /** 视频码率（bps） */
  videoBitrate?: number
  /** 音频码率（bps） */
  audioBitrate?: number
  /** 视频编码 */
  videoCodec?: string
  /** 音频编码 */
  audioCodec?: string
  /** 帧率 */
  fps?: number
  /** 文件大小（字节） */
  size?: number
}
