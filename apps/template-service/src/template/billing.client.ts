/**
 * BillingClient — template-service 调用 billing-service 的 HTTP 客户端
 *
 * 当前仅用于积分奖励场景：
 *  - POST /api/v1/points/reward  模板被使用时奖励上传者
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 幂等：每次调用传入 idempotencyKey，billing-service 保证重复请求返回首次结果
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

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name)
  private readonly httpClient: AxiosInstance

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
  }

  /**
   * 奖励积分（模板被使用时奖励上传者）
   *
   * @param params 奖励参数（含幂等键）
   * @returns 奖励结果（余额 + 流水 ID）
   */
  async reward(params: RewardParams): Promise<RewardResult> {
    const data = await this.post<RewardResultData>('/api/v1/points/reward', {
      userId: params.userId,
      amount: params.amount,
      templateId: params.templateId,
      idempotencyKey: params.idempotencyKey,
      description: params.description ?? `template:reward:${params.templateId}`,
    })

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
    const data = await this.get<RewardCountData>(
      `/api/v1/points/internal/templates/${templateId}/reward-count`,
    )
    return data.rewardCount
  }

  /**
   * 统一 POST 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   * - billing-service 返回业务错误码时抛对应业务异常
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.httpClient.post<BillingApiResponse<T>>(path, body)
      return this.unwrapResponse<T>(response.data)
    } catch (err) {
      throw this.handleAxiosError(err, path)
    }
  }

  /**
   * 统一 GET 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   * - billing-service 返回业务错误码时抛对应业务异常
   */
  private async get<T>(path: string): Promise<T> {
    try {
      const response = await this.httpClient.get<BillingApiResponse<T>>(path)
      return this.unwrapResponse<T>(response.data)
    } catch (err) {
      throw this.handleAxiosError(err, path)
    }
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
