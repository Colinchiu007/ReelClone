/**
 * BillingClient — template-service 调用 billing-service 的 HTTP 客户端
 *
 * 当前用于：
 *  - POST /api/v1/points/reward  模板被使用时奖励上传者
 *  - GET  /api/v1/points/internal/templates/:id/reward-count  查询奖励次数（对账用）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 幂等：每次 reward 调用传入 idempotencyKey，billing-service 保证重复请求返回首次结果
 *
 * 可靠性机制（B6）：
 *  - 重试：网络错误 + 5xx 自动重试（指数退避），业务错误（4xx + 非 SUCCESS）不重试
 *  - 熔断：连续失败达到阈值自动打开熔断器，冷却期后半开试探，成功后恢复
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosError, type AxiosInstance } from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'

/** billing-service 响应体（ApiResponse 包裹） */
interface BillingApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** reward 接口返回数据 */
interface RewardResultData {
  balance: number
  frozen: number
  transactionId: string
}

/** 奖励积分请求参数 */
export interface RewardParams {
  /** 被奖励的上传者用户 ID */
  userId: string
  /** 奖励数量（>0） */
  amount: number
  /** 触发奖励的模板 ID */
  templateId: string
  /** 幂等键（reward:template:{templateId}:use:{useCount}） */
  idempotencyKey: string
  /** 业务说明（可选） */
  description?: string
}

/** 奖励积分返回结果 */
export interface RewardResult {
  /** 操作后可用余额 */
  balance: number
  /** 流水 ID */
  transactionId: string
}

/** reward-count 接口返回数据 */
interface RewardCountData {
  templateId: string
  rewardCount: number
}

// -------------------- 熔断器 --------------------

/** 熔断器状态 */
enum CircuitState {
  /** 关闭（正常放行） */
  CLOSED = 'CLOSED',
  /** 打开（快速失败） */
  OPEN = 'OPEN',
  /** 半开（试探性放行） */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * 轻量熔断器（单实例，内存状态）
 *
 * 状态机：
 *  CLOSED  --连续失败达阈值-->  OPEN
 *  OPEN    --冷却时间到-->      HALF_OPEN
 *  HALF_OPEN --请求成功-->      CLOSED（重置计数）
 *  HALF_OPEN --请求失败-->      OPEN（重置冷却时间）
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  /** 当前是否允许请求通过（CLOSED 或 HALF_OPEN 放行，OPEN 拒绝） */
  allowRequest(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true
    }
    if (this.state === CircuitState.OPEN) {
      // 冷却时间到，切换到半开状态，放行一个试探请求
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = CircuitState.HALF_OPEN
        return true
      }
      return false
    }
    // HALF_OPEN：只允许一个试探请求
    return true
  }

  /** 记录成功：重置计数，关闭熔断器 */
  recordSuccess(): void {
    this.failureCount = 0
    this.state = CircuitState.CLOSED
  }

  /** 记录失败：累加计数，达到阈值则打开熔断器 */
  recordFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN
    }
  }

  /** 当前状态（供测试和日志使用） */
  getState(): CircuitState {
    return this.state
  }
}

// -------------------- 客户端 --------------------

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name)
  private readonly httpClient: AxiosInstance
  private readonly breaker: CircuitBreaker
  private readonly maxRetries: number
  private readonly baseRetryDelayMs: number

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('BILLING_SERVICE_URL') ||
      process.env.BILLING_SERVICE_URL ||
      'http://localhost:3006'
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || process.env.INTERNAL_API_KEY || ''

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    })

    // 可靠性参数（B6：重试 + 熔断）
    this.maxRetries = Number(
      this.configService.get<string>('BILLING_CLIENT_MAX_RETRIES') ??
        process.env.BILLING_CLIENT_MAX_RETRIES ??
        3,
    )
    this.baseRetryDelayMs = Number(
      this.configService.get<string>('BILLING_CLIENT_RETRY_DELAY_MS') ??
        process.env.BILLING_CLIENT_RETRY_DELAY_MS ??
        200,
    )
    const failureThreshold = Number(
      this.configService.get<string>('BILLING_CLIENT_CB_THRESHOLD') ??
        process.env.BILLING_CLIENT_CB_THRESHOLD ??
        5,
    )
    const cooldownMs = Number(
      this.configService.get<string>('BILLING_CLIENT_CB_COOLDOWN_MS') ??
        process.env.BILLING_CLIENT_CB_COOLDOWN_MS ??
        30_000,
    )
    this.breaker = new CircuitBreaker(failureThreshold, cooldownMs)
  }

  /**
   * 奖励积分（模板被使用时奖励上传者）
   *
   * @param params 奖励参数（含幂等键）
   * @returns 奖励结果（余额 + 流水 ID）
   */
  async reward(params: RewardParams): Promise<RewardResult> {
    const data = await this.requestWithRetry<RewardResultData>(() =>
      this.post('/api/v1/points/reward', {
        userId: params.userId,
        amount: params.amount,
        templateId: params.templateId,
        idempotencyKey: params.idempotencyKey,
        description: params.description ?? `template:reward:${params.templateId}`,
      }),
    )

    return {
      balance: data.balance,
      transactionId: data.transactionId,
    }
  }

  /**
   * 查询某模板已发放的 REWARD 流水数（供对账任务使用）
   *
   * @param templateId 模板 ID
   * @returns 已成功发放的奖励次数
   */
  async getRewardCount(templateId: string): Promise<number> {
    const data = await this.requestWithRetry<RewardCountData>(() =>
      this.get(`/api/v1/points/internal/templates/${templateId}/reward-count`),
    )
    return data.rewardCount
  }

  // -------------------- 内部方法 --------------------

  /**
   * 带重试 + 熔断的请求封装（B6）
   *
   * 重试策略：
   *  - 仅对网络错误（无 response）和 5xx 错误重试
   *  - 业务错误（4xx + 非 SUCCESS 业务码）不重试，直接抛出
   *  - 指数退避：baseRetryDelayMs * 2^attempt
   *
   * 熔断策略：
   *  - 熔断器 OPEN 时快速失败，不发请求
   *  - 请求成功 → recordSuccess（重置熔断器）
   *  - 请求失败 → recordFailure（累加计数）
   */
  private async requestWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    // 熔断器检查
    if (!this.breaker.allowRequest()) {
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '计费服务熔断中，请稍后重试', {
        state: 'OPEN',
      })
    }

    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation()
        this.breaker.recordSuccess()
        return result
      } catch (err) {
        lastError = err

        // 业务错误（BusinessException）不重试，直接抛出
        if (err instanceof BusinessException) {
          this.breaker.recordFailure()
          throw err
        }

        // 判断是否可重试（网络错误或 5xx）
        const retryable = this.isRetryableError(err)
        this.breaker.recordFailure()

        if (!retryable || attempt === this.maxRetries) {
          throw this.handleAxiosError(err, '(retryable)')
        }

        // 指数退避等待
        const delayMs = this.baseRetryDelayMs * Math.pow(2, attempt)
        this.logger.warn(
          `billing-service 调用失败，${delayMs}ms 后重试 (${attempt + 1}/${this.maxRetries}): ${(err as Error).message}`,
        )
        await this.sleep(delayMs)
      }
    }

    // 所有重试耗尽（理论上不会走到这里，最后一轮 attempt 已 throw）
    throw this.handleAxiosError(lastError, '(exhausted)')
  }

  /** 判断错误是否可重试（网络错误 + 5xx） */
  private isRetryableError(err: unknown): boolean {
    const axiosErr = err as AxiosError
    // 无 response = 网络错误（ECONNREFUSED/ETIMEDOUT 等）→ 可重试
    if (!axiosErr.response) {
      return true
    }
    // 5xx 服务器错误 → 可重试
    const status = axiosErr.response.status
    if (status >= 500 && status < 600) {
      return true
    }
    // 其他（4xx 等）→ 不重试
    return false
  }

  /** 指数退避等待（不可中断） */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 统一 POST 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   * - 不捕获 axios 错误，让原始错误透传到 requestWithRetry 由其判断可重试性
   * - unwrapResponse 在 HTTP 2xx 但业务码非 SUCCESS 时抛 BusinessException（不可重试）
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.httpClient.post<BillingApiResponse<T>>(path, body)
    return this.unwrapResponse<T>(response.data)
  }

  /**
   * 统一 GET 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   * - 不捕获 axios 错误，让原始错误透传到 requestWithRetry 由其判断可重试性
   * - unwrapResponse 在 HTTP 2xx 但业务码非 SUCCESS 时抛 BusinessException（不可重试）
   */
  private async get<T>(path: string): Promise<T> {
    const response = await this.httpClient.get<BillingApiResponse<T>>(path)
    return this.unwrapResponse<T>(response.data)
  }

  /** 解析 ApiResponse，业务错误码抛异常 */
  private unwrapResponse<T>(resp: BillingApiResponse<T>): T {
    if (resp.code !== ErrorCode.SUCCESS) {
      throw new BusinessException(
        resp.code as ErrorCode,
        resp.message || 'billing-service 调用失败',
      )
    }
    return resp.data
  }

  /** 统一处理 Axios 错误（网络错误 + 业务错误响应），总是抛出 */
  private handleAxiosError(err: unknown, path: string): never {
    // 已是 BusinessException，直接抛出
    if (err instanceof BusinessException) {
      throw err
    }

    // Axios 错误：尝试解析 billing-service 返回的 ApiResponse
    const axiosErr = err as AxiosError<BillingApiResponse<unknown>>
    const respData = axiosErr.response?.data
    if (respData && typeof respData.code === 'number') {
      throw new BusinessException(
        respData.code as ErrorCode,
        respData.message || 'billing-service 调用失败',
      )
    }

    // 网络错误等
    this.logger.error(`调用 billing-service 失败: ${path} ${(err as Error).message}`)
    throw new BusinessException(ErrorCode.INTERNAL_ERROR, '计费服务暂时不可用，请稍后重试', {
      path,
      message: (err as Error).message,
    })
  }
}
