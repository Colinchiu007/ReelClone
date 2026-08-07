/**
 * BillingClient — admin-service 共享的 billing-service HTTP 客户端
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用。
 *
 * 端点：
 *  - POST /api/v1/points/grant      人工调账（admin-user）
 *  - POST /api/v1/points/deduct     退款扣回积分（admin-order）
 *  - POST /api/v1/billing/reconcile 触发对账（admin-reconcile）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 可靠性：自动重试（网络错误+5xx）+ 熔断器（连续失败达阈值后快速失败）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

/** grant 调用响应 */
export interface GrantResult {
  success: boolean
  balance: number
  transactionId: string
}

/** 对账结果摘要（与 billing-service ReconciliationSummary 对齐） */
export interface ReconcileSummary {
  totalUsers: number
  inconsistentCount: number
  results: Array<{
    userId: string
    userBalance: number
    txBalance: number
    frozen: number
    expectedBalance: number
    difference: number
    isConsistent: boolean
  }>
  date?: string
  startedAt: string
  finishedAt: string
}

@Injectable()
export class BillingClient {
  private readonly client: InternalHttpClient

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.getOrThrow<string>('BILLING_SERVICE_URL')
    const apiKey = this.configService.getOrThrow<string>('INTERNAL_API_KEY')

    this.client = new InternalHttpClient({ baseUrl, apiKey })
  }

  /**
   * 赠送积分（人工调账）
   * POST /api/v1/points/grant
   */
  async grant(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    packageId: string
    description: string
  }): Promise<GrantResult> {
    const data = await this.client.post<{
      success: boolean
      balance: number
      transactionId: string
    }>('/api/v1/points/grant', params)

    return {
      success: data.success !== false,
      balance: Number(data.balance ?? 0),
      transactionId: data.transactionId,
    }
  }

  /**
   * 扣回积分（订单退款时）
   * POST /api/v1/points/deduct
   */
  async deduct(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    description: string
  }): Promise<void> {
    await this.client.post('/api/v1/points/deduct', params)
  }

  /**
   * 触发对账
   * POST /api/v1/billing/reconcile
   */
  async reconcile(params: { scope: string }): Promise<ReconcileSummary> {
    return this.client.post<ReconcileSummary>('/api/v1/billing/reconcile', params)
  }
}
