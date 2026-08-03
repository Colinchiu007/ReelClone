/**
 * BillingClient — template-service 调用 billing-service 的 HTTP 客户端
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用。
 *
 * 当前用于：
 *  - POST /api/v1/points/reward  模板被使用时奖励上传者
 *  - GET  /api/v1/points/internal/templates/:id/reward-count  查询奖励次数（对账用）
 *  - GET  /api/v1/points/internal/templates/:id/reward-ordinals  查询已发放序号列表（P1-10 间隙补偿）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 幂等：每次 reward 调用传入 idempotencyKey，billing-service 保证重复请求返回首次结果
 * 可靠性：自动重试（网络错误+5xx）+ 熔断器（连续失败达阈值后快速失败）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

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

/** reward 接口返回数据 */
interface RewardResultData {
  balance: number
  frozen: number
  transactionId: string
}

/** reward-count 接口返回数据 */
interface RewardCountData {
  templateId: string
  rewardCount: number
}

/** reward-ordinals 接口返回数据 */
interface RewardOrdinalsData {
  templateId: string
  ordinals: number[]
}

@Injectable()
export class BillingClient {
  private readonly client: InternalHttpClient

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('BILLING_SERVICE_URL') ||
      process.env.BILLING_SERVICE_URL ||
      'http://localhost:3006'
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || process.env.INTERNAL_API_KEY || ''

    // template-service 使用更宽松的重试和熔断参数
    const maxRetries = Number(
      this.configService.get<string>('BILLING_CLIENT_MAX_RETRIES') ??
        process.env.BILLING_CLIENT_MAX_RETRIES ??
        3,
    )
    const cooldownMs = Number(
      this.configService.get<string>('BILLING_CLIENT_CB_COOLDOWN_MS') ??
        process.env.BILLING_CLIENT_CB_COOLDOWN_MS ??
        30_000,
    )

    this.client = new InternalHttpClient({
      baseUrl,
      apiKey,
      retry: { maxRetries, baseDelayMs: 200 },
      circuitBreaker: { failureThreshold: 5, cooldownMs },
    })
  }

  /**
   * 奖励积分（模板被使用时奖励上传者）
   */
  async reward(params: RewardParams): Promise<RewardResult> {
    const data = await this.client.post<RewardResultData>('/api/v1/points/reward', {
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
   */
  async getRewardCount(templateId: string): Promise<number> {
    const data = await this.client.get<RewardCountData>(
      `/api/v1/points/internal/templates/${templateId}/reward-count`,
    )
    return data.rewardCount
  }

  /**
   * 查询某模板已实际发放的奖励序号列表（P1-10 间隙补偿）
   *
   * 从 main 库 CreditOperation 权威记录提取序号，用于枚举缺口补发。
   * 返回升序排列的序号数组（如 [1, 2, 4, 5] 表示 3 号漏发）。
   */
  async getRewardOrdinals(templateId: string): Promise<number[]> {
    const data = await this.client.get<RewardOrdinalsData>(
      `/api/v1/points/internal/templates/${templateId}/reward-ordinals`,
    )
    return data.ordinals
  }
}
