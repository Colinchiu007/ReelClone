/**
 * 对标视频分析 Activity 单元测试
 *
 * 覆盖 Mock 模式下的 3 个 Activity：
 * - downloadBenchmarkVideo: 返回本地 Mock 路径
 * - analyzeVideo: 返回 4 维度 Mock 分析报告
 * - summarizeReport: 基于 Mock 分析报告返回结构化报告
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
  downloadBenchmarkVideo,
  analyzeVideo,
  summarizeReport,
  analyzerActivities,
} from './analyzer.activities'
import type { AnalysisReport, StructuredReport } from '../types'

describe('analyzer.activities (Mock 模式)', () => {
  describe('downloadBenchmarkVideo', () => {
    it('返回本地 Mock 路径', async () => {
      const url = 'https://www.douyin.com/video/7438497284123456789'
      const result = await downloadBenchmarkVideo(url)
      expect(result).toMatch(/^\/tmp\/reelclone\/benchmark\/bench-/)
      expect(result).toMatch(/\.mp4$/)
    })

    it('不同 URL 返回不同路径', async () => {
      const a = await downloadBenchmarkVideo('https://douyin.com/1')
      const b = await downloadBenchmarkVideo('https://douyin.com/2')
      expect(a).not.toBe(b)
    })
  })

  describe('analyzeVideo', () => {
    let report: AnalysisReport

    beforeAll(async () => {
      report = await analyzeVideo('/tmp/reelclone/benchmark/test.mp4')
    })

    it('返回包含 4 个场景的 AnalysisReport', () => {
      expect(report.scenes).toHaveLength(4)
      expect(report.scenes[0]).toMatchObject({
        index: 0,
        start: 0,
        end: 3.5,
        duration: 3.5,
      })
    })

    it('ASR 结果包含完整口播文本与时间戳分段', () => {
      expect(report.asr.transcript).toContain('超好用的产品')
      expect(report.asr.segments).toHaveLength(4)
      expect(report.asr.segments[0]).toMatchObject({
        start: 0,
        end: 3.5,
      })
    })

    it('OCR 结果包含 3 条画面文字', () => {
      expect(report.ocr.items).toHaveLength(3)
      expect(report.ocr.items[0].text).toBe('爆款推荐')
      expect(report.ocr.items[0].confidence).toBeGreaterThan(0.9)
    })

    it('VLM 结果包含 4 条画面描述', () => {
      expect(report.vlm.descriptions).toHaveLength(4)
      expect(report.vlm.descriptions[0].sellingPoints).toContain('高颜值')
    })

    it('视频总时长为 15 秒', () => {
      expect(report.duration).toBe(15.0)
    })

    it('analysisMs 为正数', () => {
      expect(report.analysisMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('summarizeReport', () => {
    let inputReport: AnalysisReport
    let structured: StructuredReport

    beforeAll(async () => {
      // 先用 Mock 模式获取一份 AnalysisReport，再传入 summarizeReport
      inputReport = await analyzeVideo('/tmp/reelclone/benchmark/test.mp4')
      structured = await summarizeReport(inputReport)
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

    it('summaryMs 为正数', () => {
      expect(structured.summaryMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('analyzerActivities 集合', () => {
    it('包含全部 3 个 Activity 函数', () => {
      expect(typeof analyzerActivities.downloadBenchmarkVideo).toBe('function')
      expect(typeof analyzerActivities.analyzeVideo).toBe('function')
      expect(typeof analyzerActivities.summarizeReport).toBe('function')
    })

    it('集合中的函数与导出的函数引用一致', () => {
      expect(analyzerActivities.downloadBenchmarkVideo).toBe(downloadBenchmarkVideo)
      expect(analyzerActivities.analyzeVideo).toBe(analyzeVideo)
      expect(analyzerActivities.summarizeReport).toBe(summarizeReport)
    })
  })

  describe('Context.current 调用', () => {
    it('每个 Activity 执行时都调用了 Context.current().log.info', async () => {
      const mockContext = Context.current()
      expect(mockContext.log.info).toBeDefined()

      await downloadBenchmarkVideo('https://example.com/test.mp4')
      expect(mockContext.log.info).toHaveBeenCalled()
    })
  })
})
