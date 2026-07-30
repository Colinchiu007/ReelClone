/**
 * Activity 依赖容器单元测试
 *
 * 验证 setActivityDependencies / getActivityDependencies 的基本行为：
 * - 未注入时抛出明确错误
 * - 注入后能正确取回
 */
import type { ActivityDependencies } from './activity-context'

/** 构造一组 Mock 依赖（仅满足类型约束，不调用真实方法） */
function buildMockDeps(): ActivityDependencies {
  return {
    seedanceProvider: {
      submitTask: jest.fn(),
    } as unknown as ActivityDependencies['seedanceProvider'],
    videoDownloader: {
      download: jest.fn(),
    } as unknown as ActivityDependencies['videoDownloader'],
    videoAnalyzer: {
      analyze: jest.fn(),
    } as unknown as ActivityDependencies['videoAnalyzer'],
    ffmpegService: {
      transcode: jest.fn(),
    } as unknown as ActivityDependencies['ffmpegService'],
    llmProvider: {
      complete: jest.fn(),
    } as unknown as ActivityDependencies['llmProvider'],
    ossService: {
      upload: jest.fn(),
      download: jest.fn(),
    } as unknown as ActivityDependencies['ossService'],
  }
}

describe('activity-context', () => {
  it('未注入依赖时 getActivityDependencies 抛出错误', () => {
    // 使用独立模块实例，避免其他用例污染
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getActivityDependencies } = require('./activity-context')
      expect(() => getActivityDependencies()).toThrow(
        'Activity dependencies not set. Call setActivityDependencies() before starting Worker.',
      )
    })
  })

  it('注入后能正确取回全部依赖', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setActivityDependencies, getActivityDependencies } = require('./activity-context')
    const deps = buildMockDeps()
    setActivityDependencies(deps)
    const retrieved = getActivityDependencies()
    expect(retrieved).toBe(deps)
    expect(retrieved.seedanceProvider).toBe(deps.seedanceProvider)
    expect(retrieved.videoDownloader).toBe(deps.videoDownloader)
    expect(retrieved.videoAnalyzer).toBe(deps.videoAnalyzer)
    expect(retrieved.ffmpegService).toBe(deps.ffmpegService)
    expect(retrieved.llmProvider).toBe(deps.llmProvider)
    expect(retrieved.ossService).toBe(deps.ossService)
  })

  it('多次注入以最后一次为准', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setActivityDependencies, getActivityDependencies } = require('./activity-context')
    const deps1 = buildMockDeps()
    const deps2 = buildMockDeps()
    setActivityDependencies(deps1)
    setActivityDependencies(deps2)
    const retrieved = getActivityDependencies()
    expect(retrieved).toBe(deps2)
    expect(retrieved).not.toBe(deps1)
  })

  it('依赖对象包含全部 6 个 Provider 字段', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { setActivityDependencies, getActivityDependencies } = require('./activity-context')
    const deps = buildMockDeps()
    setActivityDependencies(deps)
    const retrieved = getActivityDependencies()
    expect(Object.keys(retrieved).sort()).toEqual(
      [
        'ffmpegService',
        'llmProvider',
        'ossService',
        'seedanceProvider',
        'videoAnalyzer',
        'videoDownloader',
      ].sort(),
    )
  })
})
