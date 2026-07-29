import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance, AxiosError } from 'axios'
import { CONFIG_STORE_SERVICE, type IConfigStore } from '@reelclone/common'
import {
  GenerationType,
  SeedanceSubmitResult,
  SeedanceTaskParams,
  SeedanceTaskStatus,
  SeedanceTaskState,
} from './seedance.types'

/**
 * Seedance 任务参数校验错误
 */
export class SeedanceValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SeedanceValidationError'
  }
}

/**
 * 所有 API Key 均不可用错误
 */
export class SeedanceNoAvailableKeyError extends Error {
  constructor(message = '所有 Seedance API Key 均不可用') {
    super(message)
    this.name = 'SeedanceNoAvailableKeyError'
  }
}

/**
 * Seedance 视频 AI Provider 适配器
 *
 * 能力：
 * - 支持 5 种生成类型：文生视频、图生视频（首帧/首尾帧）、编辑视频、延长视频
 * - 多 API Key 轮询：从环境变量 SEEDANCE_API_KEYS 读取（逗号分隔）
 * - 故障切换：当前 Key 失败自动切换到下一个 Key 重试
 * - Mock 模式：无 Key 时返回模拟任务 ID 与模拟视频，便于 MVP 联调
 *
 * 用法：
 *   const taskId = await provider.submitTask(params);
 *   const status = await provider.queryTask(taskId);
 *   await provider.cancelTask(taskId);
 */
@Injectable()
export class SeedanceProvider {
  private readonly logger = new Logger(SeedanceProvider.name)
  /** API Key 列表（去空后保留），运行时可被 reloadKeys() 刷新 */
  private apiKeys: string[] = []
  /** 当前使用的 Key 序号 */
  private currentKeyIndex = 0
  /** Seedance 服务地址 */
  private readonly baseUrl: string
  /** Mock 任务内存存储（仅 Mock 模式使用） */
  private readonly mockTasks = new Map<string, SeedanceTaskStatus>()
  /** Mock 任务的提交时间记录，用于推进状态 */
  private readonly mockSubmitTime = new Map<string, number>()

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(CONFIG_STORE_SERVICE) private readonly configStore: IConfigStore | null,
  ) {
    // 优先从环境变量加载初始 Key 列表（同步可用）
    const rawKeys = this.config.get<string>('SEEDANCE_API_KEYS') ?? ''
    this.apiKeys = rawKeys
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0)

    this.baseUrl =
      this.config.get<string>('SEEDANCE_BASE_URL') ?? 'https://ark.cn-beijing.volces.com/api/v3'

    if (this.isMockMode()) {
      // 生产环境硬失败：不允许在 production 下使用 Mock 模式
      // 防止误留空 API Key 导致所有视频生成返回不可访问的 Mock URL
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Seedance Provider 在生产环境中不允许 Mock 模式：请配置 SEEDANCE_API_KEYS 或通过 admin-service 设置 API Key',
        )
      }
      this.logger.warn('Seedance 处于 Mock 模式：未配置 SEEDANCE_API_KEYS，将返回模拟数据')
    } else {
      this.logger.log(`Seedance 已加载 ${this.apiKeys.length} 个 API Key，启用真实模式`)
    }

    // 如果 ConfigStore 可用，异步从 DB 加载最新 Key（覆盖环境变量）
    if (this.configStore) {
      this.reloadKeys().catch((err) => {
        this.logger.warn(
          `从 ConfigStore 初始加载 Key 失败，回退到环境变量: ${(err as Error).message}`,
        )
      })
    }
  }

  /** 是否为 Mock 模式 */
  isMockMode(): boolean {
    return this.apiKeys.length === 0
  }

  /**
   * 从 ConfigStore 重新加载 API Key 列表（热刷新）
   *
   * - ConfigStore 不可用时，回退到环境变量
   * - ConfigStore 可用但未配置时，保留现有 Key（不覆盖为空）
   * - 加载成功后重置 currentKeyIndex 为 0
   *
   * @returns 实际加载的 Key 数量
   */
  async reloadKeys(): Promise<number> {
    if (!this.configStore) {
      // 回退到环境变量
      const rawKeys = this.config.get<string>('SEEDANCE_API_KEYS') ?? ''
      this.apiKeys = rawKeys
        .split(',')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
      this.currentKeyIndex = 0
      this.logger.log(`Seedance Key 已从环境变量重新加载（${this.apiKeys.length} 个）`)
      return this.apiKeys.length
    }

    try {
      const keys = await this.configStore.getApiKeys('seedance')
      // 仅在 ConfigStore 中确实有配置时覆盖（避免 DB 未配置时清空 Key）
      if (keys.length > 0) {
        this.apiKeys = keys
        this.currentKeyIndex = 0
        this.logger.log(`Seedance Key 已从 ConfigStore 热刷新（${this.apiKeys.length} 个）`)
      } else {
        this.logger.debug('ConfigStore 中未配置 Seedance Key，保留现有 Key')
      }
    } catch (err) {
      this.logger.warn(`从 ConfigStore 加载 Key 失败，保留现有 Key: ${(err as Error).message}`)
    }
    return this.apiKeys.length
  }

  /**
   * 提交生成任务
   * @param params 任务参数
   * @returns 任务 ID 与使用的 Key 序号
   */
  async submitTask(params: SeedanceTaskParams): Promise<SeedanceSubmitResult> {
    this.validateParams(params)

    if (this.isMockMode()) {
      return this.submitMockTask(params)
    }

    // 真实模式：多 Key 故障切换
    return this.submitWithFailover(params)
  }

  /**
   * 查询任务状态
   */
  async queryTask(taskId: string): Promise<SeedanceTaskStatus> {
    if (this.isMockMode()) {
      return this.queryMockTask(taskId)
    }

    const client = this.createClient(this.currentKeyIndex)
    try {
      const resp = await client.get(`/contents/generations/tasks/${taskId}`)
      return this.mapTaskStatus(resp.data)
    } catch (err) {
      this.logger.error(
        `查询任务失败 taskId=${taskId} keyIndex=${this.currentKeyIndex}: ${this.formatError(err)}`,
      )
      throw err
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    if (this.isMockMode()) {
      const task = this.mockTasks.get(taskId)
      if (!task) {
        return false
      }
      if (task.status === 'SUCCEEDED' || task.status === 'FAILED') {
        return false
      }
      task.status = 'CANCELED'
      task.completedAt = Date.now()
      this.mockTasks.set(taskId, task)
      return true
    }

    const client = this.createClient(this.currentKeyIndex)
    try {
      await client.post(`/contents/generations/tasks/${taskId}/cancel`)
      return true
    } catch (err) {
      this.logger.error(`取消任务失败 taskId=${taskId}: ${this.formatError(err)}`)
      return false
    }
  }

  // -------------------- 参数校验 --------------------

  /** 校验任务参数，不合法抛出 SeedanceValidationError */
  private validateParams(params: SeedanceTaskParams): void {
    if (!params || !params.type) {
      throw new SeedanceValidationError('生成类型 type 不能为空')
    }
    switch (params.type) {
      case GenerationType.TEXT_TO_VIDEO:
        if (!params.prompt?.trim()) {
          throw new SeedanceValidationError('文生视频必须提供 prompt')
        }
        break
      case GenerationType.IMAGE_TO_VIDEO_FIRST_FRAME:
        if (!params.firstFrameUrl?.trim()) {
          throw new SeedanceValidationError('图生视频（首帧）必须提供 firstFrameUrl')
        }
        break
      case GenerationType.IMAGE_TO_VIDEO_FIRST_LAST_FRAME:
        if (!params.firstFrameUrl?.trim() || !params.lastFrameUrl?.trim()) {
          throw new SeedanceValidationError(
            '图生视频（首尾帧）必须提供 firstFrameUrl 与 lastFrameUrl',
          )
        }
        break
      case GenerationType.EDIT_VIDEO:
        if (!params.videoUrl?.trim()) {
          throw new SeedanceValidationError('编辑视频必须提供 videoUrl')
        }
        break
      case GenerationType.EXTEND_VIDEO:
        if (!params.sourceVideoUrl?.trim()) {
          throw new SeedanceValidationError('延长视频必须提供 sourceVideoUrl')
        }
        break
      default:
        throw new SeedanceValidationError(`不支持的生成类型: ${params.type as string}`)
    }
  }

  // -------------------- 多 Key 故障切换 --------------------

  /**
   * 多 Key 故障切换提交：从当前 Key 开始尝试，失败自动切换下一个，直到全部 Key 耗尽
   */
  private async submitWithFailover(params: SeedanceTaskParams): Promise<SeedanceSubmitResult> {
    const total = this.apiKeys.length
    let lastError: unknown

    for (let attempt = 0; attempt < total; attempt++) {
      const keyIndex = (this.currentKeyIndex + attempt) % total
      try {
        const client = this.createClient(keyIndex)
        const body = this.buildRequestBody(params)
        const resp = await client.post('/contents/generations/tasks', body)
        const taskId = this.extractTaskId(resp.data)
        // 成功：推进当前 Key 指针到下一个（轮询负载均衡）
        this.currentKeyIndex = (keyIndex + 1) % total
        this.logger.log(`任务提交成功 taskId=${taskId} 使用 keyIndex=${keyIndex}`)
        return { taskId, keyIndex }
      } catch (err) {
        lastError = err
        if (this.isKeyInvalid(err)) {
          // Key 失效（401/403）：切换到下一个 Key
          this.logger.warn(`Key[${keyIndex}] 鉴权失败，切换下一个 Key`)
          continue
        }
        // 其他错误（429 限流 / 5xx 服务异常）：短暂等待后也切换 Key
        const status = err instanceof AxiosError ? err.response?.status : undefined
        if (status === 429) {
          this.logger.warn(`Key[${keyIndex}] 被限流，切换下一个 Key`)
        } else {
          this.logger.warn(
            `Key[${keyIndex}] 提交失败 (HTTP ${status ?? 'N/A'})，切换下一个: ${this.formatError(err)}`,
          )
        }
        continue
      }
    }

    throw new SeedanceNoAvailableKeyError(
      `所有 ${total} 个 Key 均提交失败，最后错误: ${this.formatError(lastError)}`,
    )
  }

  /** 判断是否为 Key 失效错误（401/403） */
  private isKeyInvalid(err: unknown): boolean {
    if (!(err instanceof AxiosError)) return false
    return err.response?.status === 401 || err.response?.status === 403
  }

  // -------------------- 真实请求构造 --------------------

  /** 构造 Seedance 请求体 */
  private buildRequestBody(params: SeedanceTaskParams): Record<string, unknown> {
    const model = this.config.get<string>('SEEDANCE_MODEL') ?? 'doubao-seedance-1-0'
    const content: Record<string, unknown> = {
      text: params.prompt ?? '',
    }
    if (params.firstFrameUrl) {
      content.image_url = params.firstFrameUrl
    }
    if (params.lastFrameUrl) {
      content.last_image_url = params.lastFrameUrl
    }
    if (params.videoUrl) {
      content.video_url = params.videoUrl
    }
    if (params.sourceVideoUrl) {
      content.source_video_url = params.sourceVideoUrl
    }

    return {
      model,
      content: [content],
      // eslint-disable-next-line @typescript-eslint/naming-convention
      generation_type: params.type,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      resolution: params.resolution ?? '720p',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      duration: params.duration ?? 5,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      watermark: params.watermark ?? false,
      ...(params.seed != null ? { seed: params.seed } : {}),
    }
  }

  /** 从响应中提取任务 ID */
  private extractTaskId(data: unknown): string {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>
      const id = obj.id ?? obj.task_id ?? obj.taskId
      if (typeof id === 'string') return id
    }
    throw new Error('Seedance 响应中未找到任务 ID')
  }

  /** 映射火山响应为统一任务状态 */
  private mapTaskStatus(data: unknown): SeedanceTaskStatus {
    const obj = (data ?? {}) as Record<string, unknown>
    const status = this.mapStatus(obj.status as string | undefined)
    const result = obj.content as Record<string, unknown> | undefined
    const mappedResult =
      status === 'SUCCEEDED' && result
        ? {
            videoUrl: (result.video_url as string) ?? '',
            coverUrl: result.cover_url as string | undefined,
            duration: result.duration as number | undefined,
            resolution: result.resolution as '480p' | '720p' | '1080p' | '4k' | undefined,
            size: result.size as number | undefined,
          }
        : undefined
    return {
      taskId: (obj.id as string) ?? '',
      status,
      progress: obj.progress as number | undefined,
      result: mappedResult,
      error: obj.error as string | undefined,
      createdAt: obj.created_at as number | undefined,
      completedAt: obj.completed_at as number | undefined,
    }
  }

  /** 火山状态码映射 */
  private mapStatus(raw: string | undefined): SeedanceTaskState {
    switch (raw) {
      case 'queued':
      case 'pending':
        return 'PENDING'
      case 'running':
      case 'processing':
        return 'PROCESSING'
      case 'succeeded':
      case 'success':
        return 'SUCCEEDED'
      case 'failed':
      case 'error':
        return 'FAILED'
      case 'canceled':
      case 'cancelled':
        return 'CANCELED'
      default:
        return 'PENDING'
    }
  }

  /** 创建带鉴权的 axios 实例 */
  private createClient(keyIndex: number): AxiosInstance {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${this.apiKeys[keyIndex]}`,
        'Content-Type': 'application/json',
      },
    })
  }

  // -------------------- Mock 模式实现 --------------------

  /** Mock 提交任务：返回模拟任务 ID */
  private async submitMockTask(params: SeedanceTaskParams): Promise<SeedanceSubmitResult> {
    const taskId = `mock-seedance-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    const now = Date.now()
    const status: SeedanceTaskStatus = {
      taskId,
      status: 'PENDING',
      progress: 0,
      createdAt: now,
    }
    this.mockTasks.set(taskId, status)
    this.mockSubmitTime.set(taskId, now)
    this.logger.log(
      `[Mock] 提交任务 taskId=${taskId} type=${params.type} prompt=${params.prompt?.slice(0, 30) ?? ''}`,
    )
    return { taskId, keyIndex: -1 }
  }

  /**
   * Mock 查询任务：根据提交后经过的时间推进状态
   * 0-2s: PENDING, 2-8s: PROCESSING(进度递增), 8s+: SUCCEEDED
   */
  private async queryMockTask(taskId: string): Promise<SeedanceTaskStatus> {
    const task = this.mockTasks.get(taskId)
    if (!task) {
      throw new Error(`Mock 任务不存在: ${taskId}`)
    }
    if (task.status === 'SUCCEEDED' || task.status === 'FAILED' || task.status === 'CANCELED') {
      return task
    }

    const submittedAt = this.mockSubmitTime.get(taskId) ?? Date.now()
    const elapsed = (Date.now() - submittedAt) / 1000

    if (elapsed < 2) {
      task.status = 'PENDING'
      task.progress = 0
    } else if (elapsed < 8) {
      task.status = 'PROCESSING'
      task.progress = Math.min(99, Math.floor(((elapsed - 2) / 6) * 100))
    } else {
      task.status = 'SUCCEEDED'
      task.progress = 100
      task.completedAt = Date.now()
      task.result = this.buildMockResult()
    }

    this.mockTasks.set(taskId, task)
    return task
  }

  /** 构造模拟生成结果 */
  private buildMockResult() {
    return {
      videoUrl: 'https://mock.reelclone.local/videos/mock-sample.mp4',
      coverUrl: 'https://mock.reelclone.local/videos/mock-sample-cover.jpg',
      duration: 5,
      resolution: '720p' as const,
      size: 2_457_600,
    }
  }

  // -------------------- 工具方法 --------------------

  private formatError(err: unknown): string {
    if (err instanceof AxiosError) {
      return `HTTP ${err.response?.status ?? 'N/A'} ${err.message}`
    }
    if (err instanceof Error) return err.message
    return String(err)
  }
}
