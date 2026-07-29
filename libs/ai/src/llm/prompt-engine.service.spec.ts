/**
 * PromptEngineService 单元测试
 */
import { PromptEngineService } from './prompt-engine.service'
import { LlmProvider } from './llm.provider'

/**
 * 结构化对标解析报告（与 @reelclone/temporal 中的 StructuredReport 结构兼容）
 * 此处内联定义以避免 composite 项目 rootDir 约束冲突
 */
interface StructuredReport {
  style: string
  pacing: string
  shotList: Array<{
    sceneIndex: number
    duration: number
    visual: string
    voiceover: string
    onScreenText: string
  }>
  copywriting: {
    hook: string
    body: string
    cta: string
  }
  sellingPoints: string[]
  templateSuggestion: string
  summaryMs: number
}

/**
 * 构造一份可复用的 StructuredReport 测试数据
 */
function buildReport(overrides: Partial<StructuredReport> = {}): StructuredReport {
  return {
    style: '快节奏带货种草',
    pacing: '前 3 秒强 hook，中段密集卖点输出，尾部 CTA 收口',
    shotList: [
      {
        sceneIndex: 1,
        duration: 3,
        visual: '产品特写，高饱和度暖色调',
        voiceover: '这款面膜真的太绝了',
        onScreenText: '7 天见效',
      },
      {
        sceneIndex: 2,
        duration: 5,
        visual: '真人试用对比，左右分屏',
        voiceover: '看看我用了 7 天的变化',
        onScreenText: '前后对比',
      },
    ],
    copywriting: {
      hook: '这款面膜真的太绝了',
      body: '成分解析 + 真人试用对比 + 权威背书',
      cta: '点击下方链接立即抢购',
    },
    sellingPoints: ['7 天见效', '敏感肌可用', '性价比高'],
    templateSuggestion: '适用美妆种草类 3 段式带货模板',
    summaryMs: 1200,
    ...overrides,
  }
}

describe('PromptEngineService', () => {
  let service: PromptEngineService
  let llm: { complete: jest.Mock; stream: jest.Mock }

  beforeEach(() => {
    llm = {
      complete: jest.fn(),
      stream: jest.fn(),
    }
    service = new PromptEngineService(llm as unknown as LlmProvider)
  })

  describe('generateClonePrompt', () => {
    const mockLlmText =
      '高饱和度暖色调产品特写开场，3 秒强 hook 抓住眼球，中段真人试用左右分屏对比，展示 7 天变化效果，尾部 CTA 引导点击，节奏紧凑，适合美妆种草带货。'

    it('应返回正确的 CloneSuggestion 结构', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport()

      const result = await service.generateClonePrompt(report)

      expect(result).toEqual({
        prompt: mockLlmText,
        recommendedModel: 'seedance2-pro',
        recommendedDuration: 5,
        recommendedAspectRatio: '9:16',
      })
    })

    it('应调用 LLM complete 并传入 system + user 消息', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport()

      await service.generateClonePrompt(report)

      expect(llm.complete).toHaveBeenCalledTimes(1)
      const [messages, options] = llm.complete.mock.calls[0]
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('复刻提示词工程师')
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toContain('快节奏带货种草')
      expect(messages[1].content).toContain('这款面膜真的太绝了')
      expect(options).toEqual({ temperature: 0.6, maxTokens: 512 })
    })

    it('应对 LLM 返回文本做 trim 处理', async () => {
      llm.complete.mockResolvedValue(`  \n${mockLlmText}\n  `)
      const report = buildReport()

      const result = await service.generateClonePrompt(report)

      expect(result.prompt).toBe(mockLlmText)
    })

    it('竖屏风格应推荐 9:16 + 5 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({ style: '竖屏快节奏带货种草' })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('9:16')
      expect(result.recommendedDuration).toBe(5)
    })

    it('短视频风格应推荐 9:16 + 5 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({ style: '短视频种草' })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('9:16')
      expect(result.recommendedDuration).toBe(5)
    })

    it('横屏风格应推荐 16:9 + 10 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({ style: '横屏品牌大片' })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('16:9')
      expect(result.recommendedDuration).toBe(10)
    })

    it('长视频风格应推荐 16:9 + 10 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({ style: '长视频深度测评' })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('16:9')
      expect(result.recommendedDuration).toBe(10)
    })

    it('pacing 中包含横屏关键词也应推荐 16:9 + 10 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({
        style: '品牌宣传',
        pacing: '横屏叙事，节奏舒缓',
      })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('16:9')
      expect(result.recommendedDuration).toBe(10)
    })

    it('默认风格应推荐 9:16 + 5 秒', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport({
        style: '产品展示',
        pacing: '节奏平稳',
      })

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedAspectRatio).toBe('9:16')
      expect(result.recommendedDuration).toBe(5)
    })

    it('recommendedModel 应固定为 seedance2-pro', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport()

      const result = await service.generateClonePrompt(report)

      expect(result.recommendedModel).toBe('seedance2-pro')
    })

    it('应在提示词中包含镜头脚本与卖点信息', async () => {
      llm.complete.mockResolvedValue(mockLlmText)
      const report = buildReport()

      await service.generateClonePrompt(report)

      const userContent = llm.complete.mock.calls[0][0][1].content as string
      expect(userContent).toContain('产品特写')
      expect(userContent).toContain('7 天见效')
      expect(userContent).toContain('点击下方链接立即抢购')
      expect(userContent).toContain('80-200')
    })
  })
})
