/**
 * 用户上传视频转模板 Activity 单元测试
 *
 * 覆盖 Mock 模式下的 8 个 Activity：
 * - downloadAssetVideo: 返回本地 Mock 路径
 * - extractVideoMeta: 返回 Mock 视频元数据
 * - generateTemplateThumbnail: 返回 Mock 封面路径
 * - analyzeTemplateVideo: 返回 4 维度 Mock 分析报告
 * - summarizeTemplate: 基于 Mock 分析报告返回结构化模板建议
 * - uploadThumbnail: 返回 Mock 封面 OSS Key
 * - finalizeTemplate: Mock 模式下正常返回
 * - markTemplateFailed: Mock 模式下正常返回
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

// 强制 Mock 模式
beforeAll(() => {
  process.env.TEMPORAL_MOCK_MODE = 'true'
})

import {
  downloadAssetVideo,
  extractVideoMeta,
  generateTemplateThumbnail,
  analyzeTemplateVideo,
  summarizeTemplate,
  uploadThumbnail,
  finalizeTemplate,
  markTemplateFailed,
  templateActivities,
} from './template.activities'
import type { AnalysisReport, StructuredReport } from '../types'
import type { VideoMetaInfo } from '@reelclone/common'

describe('template.activities (Mock 模式)', () => {
  describe('downloadAssetVideo', () => {
    it('返回本地 Mock 路径', async () => {
      const ossKey = 'uploads/videos/user123/abc-def.mp4'
      const result = await downloadAssetVideo(ossKey)
      expect(result).toMatch(/^\/tmp\/reelclone\/template\/tpl-/)
      expect(result).toMatch(/\.mp4$/)
    })

    it('不同 ossKey 返回不同路径', async () => {
      const a = await downloadAssetVideo('uploads/videos/1.mp4')
      const b = await downloadAssetVideo('uploads/videos/2.mp4')
      expect(a).not.toBe(b)
    })
  })

  describe('extractVideoMeta', () => {
    let meta: VideoMetaInfo

    beforeAll(async () => {
      meta = await extractVideoMeta('/tmp/reelclone/template/test.mp4')
    })

    it('返回 VideoMetaInfo 对象', () => {
      expect(meta).toBeDefined()
      expect(typeof meta).toBe('object')
    })

    it('包含分辨率字段', () => {
      expect(meta.width).toBe(1080)
      expect(meta.height).toBe(1920)
    })

    it('包含时长字段', () => {
      expect(meta.duration).toBe(15)
    })

    it('包含编码字段', () => {
      expect(meta.videoCodec).toBe('h264')
      expect(meta.audioCodec).toBe('aac')
    })

    it('包含帧率字段', () => {
      expect(meta.fps).toBe(30)
    })
  })

  describe('generateTemplateThumbnail', () => {
    it('返回封面路径（将原扩展名替换为 _thumb.jpg）', async () => {
      const videoPath = '/tmp/reelclone/template/test.mp4'
      const result = await generateTemplateThumbnail(videoPath)
      expect(result).toBe('/tmp/reelclone/template/test_thumb.jpg')
    })

    it('不同视频路径返回不同封面路径', async () => {
      const a = await generateTemplateThumbnail('/tmp/a.mp4')
      const b = await generateTemplateThumbnail('/tmp/b.mp4')
      expect(a).not.toBe(b)
    })
  })

  describe('analyzeTemplateVideo', () => {
    let report: AnalysisReport

    beforeAll(async () => {
      report = await analyzeTemplateVideo('/tmp/reelclone/template/test.mp4')
    })

    it('返回包含 5 个场景的 AnalysisReport', () => {
      expect(report.scenes).toHaveLength(5)
      expect(report.scenes[0]).toMatchObject({
        index: 0,
        start: 0,
        end: 2.5,
        duration: 2.5,
      })
    })

    it('ASR 结果包含完整口播文本与时间戳分段', () => {
      expect(report.asr.transcript).toContain('神仙好物')
      expect(report.asr.segments).toHaveLength(5)
      expect(report.asr.segments[0]).toMatchObject({
        start: 0,
        end: 2.5,
      })
    })

    it('OCR 结果包含 3 条画面文字', () => {
      expect(report.ocr.items).toHaveLength(3)
      expect(report.ocr.items[0].text).toBe('新品上市')
      expect(report.ocr.items[0].confidence).toBeGreaterThan(0.9)
    })

    it('VLM 结果包含 5 条画面描述', () => {
      expect(report.vlm.descriptions).toHaveLength(5)
      expect(report.vlm.descriptions[0].sellingPoints).toContain('产品特写')
    })

    it('视频总时长为 15 秒', () => {
      expect(report.duration).toBe(15.0)
    })

    it('analysisMs 为非负数', () => {
      expect(report.analysisMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('summarizeTemplate', () => {
    let inputReport: AnalysisReport
    let structured: StructuredReport

    beforeAll(async () => {
      // 先用 Mock 模式获取一份 AnalysisReport，再传入 summarizeTemplate
      inputReport = await analyzeTemplateVideo('/tmp/reelclone/template/test.mp4')
      structured = await summarizeTemplate(inputReport)
    })

    it('返回 StructuredReport 对象', () => {
      expect(structured).toBeDefined()
      expect(typeof structured).toBe('object')
    })

    it('shotList 长度与输入 scenes 一致', () => {
      expect(structured.shotList).toHaveLength(inputReport.scenes.length)
    })

    it('shotList 每项包含 sceneIndex/duration/visual/voiceover/onScreenText', () => {
      for (const shot of structured.shotList) {
        expect(shot).toHaveProperty('sceneIndex')
        expect(shot).toHaveProperty('duration')
        expect(shot).toHaveProperty('visual')
        expect(shot).toHaveProperty('voiceover')
        expect(shot).toHaveProperty('onScreenText')
      }
    })

    it('copywriting 包含 hook/body/cta', () => {
      expect(structured.copywriting.hook).toBeTruthy()
      expect(structured.copywriting.body).toBeTruthy()
      expect(structured.copywriting.cta).toBeTruthy()
    })

    it('sellingPoints 至少有 1 条', () => {
      expect(structured.sellingPoints.length).toBeGreaterThan(0)
    })

    it('templateSuggestion 非空', () => {
      expect(structured.templateSuggestion).toBeTruthy()
    })

    it('summaryMs 为非负数', () => {
      expect(structured.summaryMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('uploadThumbnail', () => {
    it('返回符合命名规则的 coverKey', async () => {
      const result = await uploadThumbnail({
        thumbnailPath: '/tmp/reelclone/template/test_thumb.jpg',
        userId: 'user-123',
        templateId: 'tpl-456',
      })
      expect(result).toBe('templates/covers/user-123/tpl-456.jpg')
    })

    it('不同用户/模板返回不同 coverKey', async () => {
      const a = await uploadThumbnail({
        thumbnailPath: '/tmp/a.jpg',
        userId: 'user-1',
        templateId: 'tpl-1',
      })
      const b = await uploadThumbnail({
        thumbnailPath: '/tmp/b.jpg',
        userId: 'user-2',
        templateId: 'tpl-2',
      })
      expect(a).not.toBe(b)
    })
  })

  describe('finalizeTemplate', () => {
    it('Mock 模式下正常返回（不抛异常）', async () => {
      const meta: VideoMetaInfo = {
        duration: 15,
        width: 1080,
        height: 1920,
        videoCodec: 'h264',
        audioCodec: 'aac',
        fps: 30,
      }
      const report = await analyzeTemplateVideo('/tmp/test.mp4')
      const suggestion = await summarizeTemplate(report)

      await expect(
        finalizeTemplate({
          templateId: 'tpl-123',
          meta,
          analysisReport: report,
          templateSuggestion: suggestion,
          coverKey: 'templates/covers/user-1/tpl-123.jpg',
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('markTemplateFailed', () => {
    it('Mock 模式下正常返回（不抛异常）', async () => {
      await expect(
        markTemplateFailed({
          templateId: 'tpl-123',
          reason: '分析超时',
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('templateActivities 集合', () => {
    it('包含全部 8 个 Activity 函数', () => {
      expect(typeof templateActivities.downloadAssetVideo).toBe('function')
      expect(typeof templateActivities.extractVideoMeta).toBe('function')
      expect(typeof templateActivities.generateTemplateThumbnail).toBe('function')
      expect(typeof templateActivities.analyzeTemplateVideo).toBe('function')
      expect(typeof templateActivities.summarizeTemplate).toBe('function')
      expect(typeof templateActivities.uploadThumbnail).toBe('function')
      expect(typeof templateActivities.finalizeTemplate).toBe('function')
      expect(typeof templateActivities.markTemplateFailed).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(templateActivities.downloadAssetVideo).toBe(downloadAssetVideo)
      expect(templateActivities.extractVideoMeta).toBe(extractVideoMeta)
      expect(templateActivities.generateTemplateThumbnail).toBe(generateTemplateThumbnail)
      expect(templateActivities.analyzeTemplateVideo).toBe(analyzeTemplateVideo)
      expect(templateActivities.summarizeTemplate).toBe(summarizeTemplate)
      expect(templateActivities.uploadThumbnail).toBe(uploadThumbnail)
      expect(templateActivities.finalizeTemplate).toBe(finalizeTemplate)
      expect(templateActivities.markTemplateFailed).toBe(markTemplateFailed)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const ctx = Context.current()
      expect(ctx.log.info).toBeDefined()

      await downloadAssetVideo('uploads/test.mp4')
      expect(ctx.log.info).toHaveBeenCalled()
    })
  })
})
