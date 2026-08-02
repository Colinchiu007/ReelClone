/**
 * BillingClient — 调用 billing-service 的 HTTP 客户端
 *
 * 使用 @reelclone/http-client 统一内部 HTTP 调用：
 *  - POST /api/v1/points/freeze   冻结积分（任务提交时）
 *  - POST /api/v1/points/settle  结算冻结积分（任务成功后）
 *  - POST /api/v1/points/release 释放冻结积分（任务取消/失败时）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 幂等：每次调用传入 idempotencyKey，billing-service 保证重复请求返回首次结果
 * 可靠性：自动重试（网络错误+5xx）+ 熔断器（连续失败达阈值后快速失败）
 */
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InternalHttpClient } from '@reelclone/http-client'

/** 冻结响应 */
export interface FreezeResult {
  /** 冻结金额 */
  frozenAmount: number
  /** 操作后余额 */
  balance: number
  /** 冻结流水 ID（后续 settle/release 复用） */
  freezeId: string
}

/** 结算/释放响应 */
export interface OperationResult {
  /** 操作后余额 */
  balance: number
  /** 流水 ID */
  transactionId: string
}

/** billing-service 内部操作 data 结构 */
interface BillingOperationData {
  success: boolean
  frozenAmount?: number
  balance: number
  transactionId: string
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

    this.client = new InternalHttpClient({ baseUrl, apiKey })
  }

  /**
   * 冻结积分
   * @param userId 用户 ID
   * @param amount 冻结数量（>0）
   * @param idempotencyKey 幂等键
   * @param workId 关联作品 ID
   */
  async freeze(
    userId: string,
    amount: number,
    idempotencyKey: string,
    workId: string,
  ): Promise<FreezeResult> {
    const data = await this.client.post<BillingOperationData>('/api/v1/points/freeze', {
      userId,
      amount,
      idempotencyKey,
      workId,
      reservationMode: true,
      description: `workbench:freeze:${workId}`,
    })

    return {
      frozenAmount: data.frozenAmount ?? amount,
      balance: data.balance,
      freezeId: data.transactionId,
    }
  }

  /**
   * 结算冻结积分（任务成功后按实际用量结算）
   */
  async settle(
    userId: string,
    amount: number,
    idempotencyKey: string,
    workId: string,
    freezeId: string,
    billingMode: 'v2' | 'legacy' = 'v2',
  ): Promise<OperationResult> {
    const data = await this.client.post<BillingOperationData>('/api/v1/points/settle', {
      userId,
      amount,
      idempotencyKey,
      freezeId,
      workId,
      reservationMode: billingMode !== 'legacy',
      description: `workbench:settle:${workId}`,
    })

    return {
      balance: data.balance,
      transactionId: data.transactionId,
    }
  }

  /**
   * 释放冻结积分（任务取消/失败时）
   */
  async release(
    userId: string,
    amount: number,
    idempotencyKey: string,
    freezeId: string,
    billingMode: 'v2' | 'legacy' = 'v2',
  ): Promise<OperationResult> {
    const data = await this.client.post<BillingOperationData>('/api/v1/points/release', {
      userId,
      amount,
      idempotencyKey,
      freezeId,
      reservationMode: billingMode !== 'legacy',
      description: `workbench:release`,
    })

    return {
      balance: data.balance,
      transactionId: data.transactionId,
    }
  }
}
