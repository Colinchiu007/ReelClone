/**
 * OSS 对象存储 Activity 单元测试
 *
 * 覆盖 Mock 模式下的 2 个 Activity：
 * - uploadToOSS: 返回 Mock OSS URL
 * - generateSignedUrl: 返回带 expires 与 signature 的 Mock 签名 URL
 *
 * 真实模式分支尚未接入 libs/oss，抛出明确错误。
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

// 强制 Mock 模式
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import { uploadToOSS, generateSignedUrl, ossActivities } from './oss.activities'

describe('oss.activities (Mock 模式)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('uploadToOSS', () => {
    it('返回 Mock OSS URL', async () => {
      const result = await uploadToOSS('/tmp/video.mp4', 'works/123/output.mp4')
      expect(result).toBe('https://mock-oss.reelclone.dev/works/123/output.mp4')
    })

    it('不同 key 返回不同 URL', async () => {
      const a = await uploadToOSS('/tmp/a.mp4', 'works/123/a.mp4')
      const b = await uploadToOSS('/tmp/b.mp4', 'works/456/b.mp4')
      expect(a).not.toBe(b)
    })

    it('调用了 ctx.log.info', async () => {
      await uploadToOSS('/tmp/video.mp4', 'works/123/output.mp4')
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })

  describe('generateSignedUrl', () => {
    it('返回包含 expires 和 signature 的签名 URL', async () => {
      const result = await generateSignedUrl('works/123/output.mp4')
      expect(result).toMatch(
        /^https:\/\/mock-oss\.reelclone\.dev\/works\/123\/output\.mp4\?expires=\d+&signature=mock$/,
      )
    })

    it('expires 为未来时间戳（当前 + 900 秒）', async () => {
      const before = Math.floor(Date.now() / 1000) + 900
      const result = await generateSignedUrl('works/123/output.mp4')
      const after = Math.floor(Date.now() / 1000) + 900

      const match = result.match(/expires=(\d+)/)
      expect(match).not.toBeNull()
      const expires = Number(match![1])
      expect(expires).toBeGreaterThanOrEqual(before)
      expect(expires).toBeLessThanOrEqual(after)
    })

    it('不同 key 返回不同 URL', async () => {
      const a = await generateSignedUrl('works/123/a.mp4')
      const b = await generateSignedUrl('works/456/b.mp4')
      expect(a).not.toBe(b)
    })
  })

  describe('ossActivities 集合', () => {
    it('包含 2 个 Activity 函数', () => {
      expect(typeof ossActivities.uploadToOSS).toBe('function')
      expect(typeof ossActivities.generateSignedUrl).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(ossActivities.uploadToOSS).toBe(uploadToOSS)
      expect(ossActivities.generateSignedUrl).toBe(generateSignedUrl)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const ctx = Context.current()
      expect(ctx.log.info).toBeDefined()

      await uploadToOSS('/tmp/video.mp4', 'works/123/output.mp4')
      expect(ctx.log.info).toHaveBeenCalled()
    })
  })

  describe('真实模式', () => {
    let originalFlag: string | undefined
    beforeAll(() => {
      originalFlag = process.env.TEMPORAL_MOCK_MODE
      process.env.TEMPORAL_MOCK_MODE = 'false'
    })
    afterAll(() => {
      process.env.TEMPORAL_MOCK_MODE = originalFlag
    })

    it('uploadToOSS 抛错：真实模式尚未接入', async () => {
      await expect(uploadToOSS('/tmp/video.mp4', 'works/123/output.mp4')).rejects.toThrow(
        '[OSS] 真实模式尚未接入 libs/oss',
      )
    })

    it('generateSignedUrl 抛错：真实模式尚未接入', async () => {
      await expect(generateSignedUrl('works/123/output.mp4')).rejects.toThrow(
        '[OSS] 真实模式尚未接入 libs/oss',
      )
    })
  })
})
