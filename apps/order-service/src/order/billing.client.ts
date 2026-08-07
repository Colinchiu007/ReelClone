/**
 * BillingClient — 调用 billing-service 赠送积分
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用。
 *
 * 端点: POST {BILLING_SERVICE_URL}/api/v1/points/grant
 *
 * 调用场景: 支付回调成功后，向用户赠送套餐积分。
 * 可靠性：自动重试（网络错误+5xx）+ 熔断器（连续失败达阈值后快速失败）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

/** grant 调用响应 */
export interface GrantResult {
  /** 用户当前可用余额 */
  balance: number
  /** 是否成功 */
  success: boolean
  /** 流水 ID */
  transactionId?: string
}

@Injectable()
export class BillingClient {
  private readonly client: InternalHttpClient

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('BILLING_SERVICE_URL') || process.env.BILLING_SERVICE_URL
    if (!baseUrl) {
      throw new Error('BILLING_SERVICE_URL is not configured (fail-closed)')
    }
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') || process.env.INTERNAL_API_KEY || ''

    this.client = new InternalHttpClient({ baseUrl, apiKey })
  }

  /**
   * 调用 billing-service 赠送积分
   */
  async grant(params: {
    userId: string
    amount: number
    idempotencyKey: string
    orderId: string
    packageId: string
  }): Promise<GrantResult> {
    const data = await this.client.post<{
      balance: number
      transactionId: string
      success: boolean
    }>('/api/v1/points/grant', {
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
      orderId: params.orderId,
      packageId: params.packageId,
      description: `订单 ${params.orderId} 套餐 ${params.packageId} 赠送积分`,
    })

    return {
      balance: Number(data.balance ?? 0),
      success: data.success !== false,
      transactionId: data.transactionId,
    }
  }
}
