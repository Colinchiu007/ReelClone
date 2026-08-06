import {
  Platform,
  PLATFORM_LABELS,
  PLATFORM_METADATA,
  PLATFORM_OPTIONS,
} from '../platform'

describe('platform capabilities', () => {
  it('uses backend enum values for every shared platform option', () => {
    expect(PLATFORM_OPTIONS.map(({ value }) => value)).toEqual([
      'DOUYIN',
      'XIAOHONGSHU',
      'BILIBILI',
      'KUAISHOU',
      'WEIBO',
      'WECHAT_VIDEO',
    ])
    expect(PLATFORM_LABELS[Platform.WECHAT_VIDEO]).toBe('视频号')
    expect(PLATFORM_METADATA[Platform.DOUYIN]).toEqual({
      value: Platform.DOUYIN,
      label: '抖音',
      icon: '🎵',
    })
  })
})
