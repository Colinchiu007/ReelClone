/**
 * BillingClient — billing-service 内部 API 调用客户端
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用。
 *
 * 通过内部 API Key（x-api-key）调用 billing-service 的 freeze / release 端点。
 * 可靠性：自动重试（网络错误+5xx）+ 熔断器（连续失败达阈值后快速失败）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

/** 冻结积分响应 */
export interface FreezeResponse {
  success: boolean
  frozenAmount?: number
  balance: number
  transactionId: string
}

/** 释放积分响应 */
export interface ReleaseResponse {
  success: boolean
  frozenAmount?: number
  balance: number
  transactionId: string
}

/** 冻结积分请求参数 */
export interface FreezeParams {
  userId: string
  amount: number
  idempotencyKey: string
  benchmarkId?: string
  description?: string
}

/** 结算积分请求参数 */
export interface SettleParams {
  userId: string
  amount: number
  idempotencyKey: string
  freezeId: string
  description?: string
}

/** 释放积分请求参数 */
export interface ReleaseParams {
  userId: string
  amount: number
  idempotencyKey: string
  freezeId: string
  description?: string
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
   * 冻结积分
   * POST /api/v1/points/freeze
   *
   * B4 重构：切换到 V2 CreditReservation 路径（reservationMode=true），
   * 使 benchmark 与生成链路使用相同的 durable reservation 机制。
   */
  async freeze(params: FreezeParams): Promise<FreezeResponse> {
    return this.client.post<FreezeResponse>('/api/v1/points/freeze', {
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
      workId: params.benchmarkId,
      description: params.description ?? '对标解析',
      reservationMode: true,
    })
  }

  /**
   * 结算冻结积分（任务成功后调用）
   * POST /api/v1/points/settle
   *
   * B4 新增：任务成功完成时结算冻结的积分。
   */
  async settle(params: SettleParams): Promise<FreezeResponse> {
    return this.client.post<FreezeResponse>('/api/v1/points/settle', {
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
      freezeId: params.freezeId,
      description: params.description ?? '对标解析结算',
      reservationMode: true,
    })
  }

  /**
   * 释放积分
   * POST /api/v1/points/release
   *
   * B4 重构：切换到 V2 CreditReservation 路径（reservationMode=true）。
   */
  async release(params: ReleaseParams): Promise<ReleaseResponse> {
    return this.client.post<ReleaseResponse>('/api/v1/points/release', {
      userId: params.userId,
      amount: params.amount,
      idempotencyKey: params.idempotencyKey,
      freezeId: params.freezeId,
      description: params.description ?? '对标解析取消',
      reservationMode: true,
    })
  }
}
