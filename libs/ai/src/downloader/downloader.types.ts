/**
 * 视频下载器类型定义
 */

/** 支持的视频平台 */
export enum VideoPlatform {
  /** 抖音 */
  DOUYIN = 'DOUYIN',
  /** 小红书 */
  XIAOHONGSHU = 'XIAOHONGSHU',
  /** 哔哩哔哩 */
  BILIBILI = 'BILIBILI',
  /** 快手 */
  KUAISHOU = 'KUAISHOU',
  /** 微博 */
  WEIBO = 'WEIBO',
  /** 未知/其他 */
  UNKNOWN = 'UNKNOWN',
}

/** 视频元信息 */
export interface VideoMetadata {
  /** 标题 */
  title?: string;
  /** 作者 */
  author?: string;
  /** 平台原始 ID */
  sourceId?: string;
  /** 描述 */
  description?: string;
  /** 发布时间（毫秒时间戳） */
  publishedAt?: number;
  /** 时长（秒） */
  duration?: number;
  /** 封面 URL */
  coverUrl?: string;
}

/** 下载结果 */
export interface DownloadResult {
  /** 本地视频文件路径 */
  videoPath: string;
  /** 视频平台 */
  platform: VideoPlatform;
  /** 视频元信息 */
  metadata: VideoMetadata;
  /** 使用的下载工具：lux / yt-dlp / mock */
  downloader: 'lux' | 'yt-dlp' | 'mock';
}
