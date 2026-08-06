export enum Platform {
  DOUYIN = 'DOUYIN',
  XIAOHONGSHU = 'XIAOHONGSHU',
  BILIBILI = 'BILIBILI',
  KUAISHOU = 'KUAISHOU',
  WEIBO = 'WEIBO',
  WECHAT_VIDEO = 'WECHAT_VIDEO',
}

export interface PlatformOption {
  value: Platform
  label: string
  icon: string
}

export const PLATFORM_OPTIONS: PlatformOption[] = [
  { value: Platform.DOUYIN, label: '抖音', icon: '🎵' },
  { value: Platform.XIAOHONGSHU, label: '小红书', icon: '📕' },
  { value: Platform.BILIBILI, label: 'B站', icon: '📺' },
  { value: Platform.KUAISHOU, label: '快手', icon: '⚡' },
  { value: Platform.WEIBO, label: '微博', icon: '🔴' },
  { value: Platform.WECHAT_VIDEO, label: '视频号', icon: '💬' },
]

export const PLATFORM_LABELS: Record<Platform, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<Platform, string>

export const PLATFORM_METADATA: Record<Platform, PlatformOption> = Object.fromEntries(
  PLATFORM_OPTIONS.map((option) => [option.value, option]),
) as Record<Platform, PlatformOption>
