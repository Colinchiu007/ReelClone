import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import { CONFIG_STORE_SERVICE, type IConfigStore } from '@reelclone/common'
import { LlmCompleteOptions, LlmMessage, LlmProvider as LlmProviderType } from './llm.types'

/**
 * LLM 大语言模型适配器
 *
 * 支持通义/豆包/DeepSeek，三者均兼容 OpenAI Chat Completions 协议。
 * 通过环境变量 LLM_PROVIDER 选择服务商，LLM_API_KEY 为空时启用 Mock 模式。
 *
 * 相关环境变量：
 * - LLM_PROVIDER: tongyi | doubao | deepseek | openai
 * - LLM_API_KEY: API Key
 * - LLM_BASE_URL: 服务地址
 * - LLM_MODEL: 默认模型名
 *
 * ConfigStore 集成：
 * - 优先从 ConfigStore 加载 Key（支持运行时热刷新）
 * - ConfigStore 不可用时回退到环境变量
 */
@Injectable()
export class LlmProvider {
  private readonly logger = new Logger(LlmProvider.name)
  /** 当前 API Key（运行时可被 reloadKeys() 刷新） */
  private apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly provider: LlmProviderType

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(CONFIG_STORE_SERVICE) private readonly configStore: IConfigStore | null,
  ) {
    // 优先从环境变量加载初始 Key（同步可用）
    this.apiKey = this.config.get<string>('LLM_API_KEY') ?? ''
    this.baseUrl = this.config.get<string>('LLM_BASE_URL') ?? ''
    this.model = this.config.get<string>('LLM_MODEL') ?? 'gpt-4o-mini'
    this.provider = this.resolveProvider(this.config.get<string>('LLM_PROVIDER') ?? '')

    if (this.isMockMode()) {
      this.logger.warn('LLM 处于 Mock 模式：未配置 LLM_API_KEY，将返回模板文案')
    } else {
      this.logger.log(`LLM 启用真实模式 provider=${this.provider} model=${this.model}`)
    }

    // 如果 ConfigStore 可用，异步从 DB 加载最新 Key（覆盖环境变量）
    if (this.configStore) {
      this.reloadKeys().catch((err) => {
        this.logger.warn(
          `从 ConfigStore 初始加载 Key 失败，回退到环境变量: ${(err as Error).message}`,
        )
      })
      // 注册 Key 更新回调：当 admin-service 更新 Key 后，ConfigStore 通过 Pub/Sub
      // 通知本实例主动调用 reloadKeys() 刷新内存中的 Key
      this.configStore.onKeyUpdate('llm', async () => {
        await this.reloadKeys()
      })
    }
  }

  /** 是否为 Mock 模式 */
  isMockMode(): boolean {
    return !this.apiKey
  }

  /**
   * 从 ConfigStore 重新加载 API Key（热刷新）
   *
   * - ConfigStore 不可用时，保留现有 Key
   * - ConfigStore 可用但未配置时，保留现有 Key（不覆盖为空）
   * - ConfigStore 可用且有配置时，更新 Key
   */
  async reloadKeys(): Promise<void> {
    if (!this.configStore) {
      return
    }
    try {
      const keys = await this.configStore.getApiKeys('llm')
      if (keys.length > 0) {
        this.apiKey = keys[0]
        this.logger.log(`LLM API Key 已从 ConfigStore 热刷新（共 ${keys.length} 个）`)
      }
    } catch (err) {
      this.logger.warn(`LLM reloadKeys 失败: ${(err as Error).message}`)
    }
  }

  /**
   * 同步补全
   * @param messages 消息列表
   * @param options 补全参数
   * @returns 完整文本
   */
  async complete(messages: LlmMessage[], options?: LlmCompleteOptions): Promise<string> {
    if (this.isMockMode()) {
      return this.mockComplete(messages)
    }

    const client = this.createClient()
    const resp = await client.post('/chat/completions', {
      model: options?.model ?? this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      max_tokens: options?.maxTokens ?? 1024,
      stream: false,
    })
    return this.extractText(resp.data)
  }

  /**
   * 流式补全
   * @param messages 消息列表
   * @param options 补全参数
   * @returns 文本片段异步迭代器
   */
  async *stream(
    messages: LlmMessage[],
    options?: LlmCompleteOptions,
  ): AsyncGenerator<string, void, unknown> {
    if (this.isMockMode()) {
      yield* this.mockStream(messages)
      return
    }

    const client = this.createClient()
    const resp = await client.post(
      '/chat/completions',
      {
        model: options?.model ?? this.model,
        messages,
        temperature: options?.temperature ?? 0.7,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
      },
      { responseType: 'stream' },
    )

    // 解析 SSE 流
    const stream = resp.data as AsyncIterable<Buffer>
    let buffer = ''
    for await (const chunk of stream) {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const text = this.parseSseLine(line)
        if (text) yield text
      }
    }
  }

  // -------------------- 私有方法 --------------------

  /** 解析服务商枚举 */
  private resolveProvider(raw: string): LlmProviderType {
    switch (raw.toLowerCase()) {
      case 'tongyi':
      case 'qwen':
        return LlmProviderType.TONGYI
      case 'doubao':
        return LlmProviderType.DOUBAO
      case 'deepseek':
        return LlmProviderType.DEEPSEEK
      case 'openai':
        return LlmProviderType.OPENAI
      default:
        return LlmProviderType.OPENAI
    }
  }

  /** 创建带鉴权的 axios 实例 */
  private createClient(): AxiosInstance {
    const baseUrl = this.baseUrl || this.getDefaultBaseUrl(this.provider)
    return axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    })
  }

  /** 各服务商默认服务地址 */
  private getDefaultBaseUrl(provider: LlmProviderType): string {
    switch (provider) {
      case LlmProviderType.TONGYI:
        return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      case LlmProviderType.DOUBAO:
        return 'https://ark.cn-beijing.volces.com/api/v3'
      case LlmProviderType.DEEPSEEK:
        return 'https://api.deepseek.com/v1'
      default:
        return 'https://api.openai.com/v1'
    }
  }

  /** 从响应中提取文本 */
  private extractText(data: unknown): string {
    const obj = (data ?? {}) as Record<string, unknown>
    const choices = obj.choices as Array<Record<string, unknown>> | undefined
    const message = choices?.[0]?.message as Record<string, unknown> | undefined
    return (message?.content as string) ?? ''
  }

  /** 解析 SSE 单行 */
  private parseSseLine(line: string): string | null {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') return null
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      const choices = parsed.choices as Array<Record<string, unknown>> | undefined
      const delta = choices?.[0]?.delta as Record<string, unknown> | undefined
      return (delta?.content as string) ?? null
    } catch {
      return null
    }
  }

  // -------------------- Mock 模式 --------------------

  /** Mock 同步补全：根据最后一条用户消息返回模板文案 */
  private async mockComplete(messages: LlmMessage[]): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const userText = lastUser?.content ?? ''
    this.logger.log(`[Mock] 同步补全，输入预览: ${userText.slice(0, 30)}`)
    return this.buildMockText(userText)
  }

  /** Mock 流式补全：按字分片输出 */
  private async *mockStream(messages: LlmMessage[]): AsyncGenerator<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const userText = lastUser?.content ?? ''
    const fullText = this.buildMockText(userText)
    // 按字符切片模拟流式
    for (const char of fullText) {
      yield char
    }
  }

  /** 构造 Mock 文本 */
  private buildMockText(userText: string): string {
    return [
      '【Mock 文案】',
      `根据您的需求"${userText.slice(0, 40) || '通用创作'}"，为您生成如下内容：`,
      '',
      '🌟 亮点一：高质感画面呈现，精准还原产品细节，第一眼抓住用户眼球。',
      '🌟 亮点二：紧凑叙事节奏，5 秒内传递核心卖点，提升转化效率。',
      '🌟 亮点三：贴合目标人群的文案表达，情感共鸣驱动行动。',
      '',
      '适用场景：短视频带货种草、品牌曝光、产品发布预热。',
    ].join('\n')
  }
}
