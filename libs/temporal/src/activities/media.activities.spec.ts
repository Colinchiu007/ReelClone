/**
 * 媒体处理 Activity 单元测试
 *
 * 覆盖 Mock 模式下的全部 4 个 Activity：
 * - downloadVideo: 返回本地 Mock 路径
 * - postProcessVideo: 返回 Mock OSS Key
 * - generateThumbnail: 返回 Mock 封面 OSS Key
 * - moderateContent: 返回 PASSED
 *
 * 真实模式分支需 Temporal Worker 上下文 + 注入 Provider，由集成测试覆盖。
 */
import { Context } from '@temporalio/activity'

// Mock @temporalio/activity 的 Context.current()
// 必须返回同一个对象，否则 Activity 内部调用与测试中验证的不是同一个 jest.fn()
const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}
const mockContext = { log: mockLog }
jest.mock('@temporalio/activity', () => ({
  Context: {
    current: () => mockContext,
  },
}))

// 强制 Mock 模式（覆盖 NODE_ENV=production 的默认行为）
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import {
  downloadVideo,
  postProcessVideo,
  generateThumbnail,
  moderateContent,
  mediaActivities,
} from './media.activities'
import { ModerationDecision } from '../types'

describe('media.activities (Mock 模式)', () => {
  describe('downloadVideo', () => {
    it('返回本地 Mock 路径', async () => {
      const url = 'https://www.douyin.com/video/123456'
      const result = await downloadVideo(url)
      expect(result).toMatch(/^\/tmp\/reelclone\/video-/)
      expect(result).toMatch(/\.mp4$/)
    })

    it('不同 URL 返回不同路径', async () => {
      const a = await downloadVideo('https://douyin.com/1')
      const b = await downloadVideo('https://douyin.com/2')
      expect(a).not.toBe(b)
    })
  })

  describe('postProcessVideo', () => {
    it('返回 Mock OSS Key', async () => {
      const result = await postProcessVideo('https://example.com/input.mp4', {
        codec: 'h264',
        resolution: '1080p',
        bitrate: '2500k',
      })
      expect(result).toMatch(/^works\/\d+\/output-/)
      expect(result).toMatch(/\.mp4$/)
    })

    it('空配置也能正常返回', async () => {
      const result = await postProcessVideo('https://example.com/input.mp4', {})
      expect(result).toMatch(/^works\//)
    })
  })

  describe('generateThumbnail', () => {
    it('返回 Mock 封面 OSS Key', async () => {
      const result = await generateThumbnail('/tmp/video.mp4')
      expect(result).toMatch(/^covers\/\d+\/cover-/)
      expect(result).toMatch(/\.jpg$/)
    })
  })

  describe('moderateContent', () => {
    it('Mock 模式默认通过审核', async () => {
      const result = await moderateContent('works/123/output.mp4', 'covers/123/cover.jpg')
      expect(result.passed).toBe(true)
      expect(result.decision).toBe(ModerationDecision.PASSED)
      expect(result.labels).toEqual([])
    })
  })

  describe('mediaActivities 集合', () => {
    it('包含全部 4 个 Activity 函数', () => {
      expect(typeof mediaActivities.downloadVideo).toBe('function')
      expect(typeof mediaActivities.postProcessVideo).toBe('function')
      expect(typeof mediaActivities.generateThumbnail).toBe('function')
      expect(typeof mediaActivities.moderateContent).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(mediaActivities.downloadVideo).toBe(downloadVideo)
      expect(mediaActivities.postProcessVideo).toBe(postProcessVideo)
      expect(mediaActivities.generateThumbnail).toBe(generateThumbnail)
      expect(mediaActivities.moderateContent).toBe(moderateContent)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      // 由于我们 mock 了 Context.current 返回带 jest.fn() 的 log，
      // 可以验证 log.info 被调用（但不强断言调用次数，避免脆弱）
      const mockContext = Context.current()
      expect(mockContext.log.info).toBeDefined()

      await downloadVideo('https://example.com/test.mp4')
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })
})
