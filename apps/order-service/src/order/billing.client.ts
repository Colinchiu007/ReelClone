/**
 * BillingClient — 调用 billing-service 赠送积分
 *
 * 端点: POST {BILLING_SERVICE_URL}/api/v1/points/grant
 * Headers: x-api-key: ${INTERNAL_API_KEY}
 *
 * 调用场景: 支付回调成功后，向用户赠送套餐积分。
 *
 * 注意：本服务运行在 NestJS 容器内，使用 NestJS 提供的 HttpService（基于 axios）
 *      或全局 fetch。为减少依赖，这里使用 Node.js 内置 fetch（Node 18+ 支持）。
 */
import { Injectable, Logger } from '@nestjs/common';

/** grant 调用响应 */
export interface GrantResult {
  /** 用户当前可用余额 */
  balance: number;
  /** 是否成功 */
  success: boolean;
  /** 流水 ID */
  transactionId?: string;
}

/**
 * billing-service 客户端
 *
 * 通过 HTTP 调用 billing-service 的 /api/v1/points/grant 接口赠送积分。
 * billing-service 自身已实现幂等，但传入 idempotencyKey 便于跨服务追踪。
 */
@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);

  /** billing-service 基础地址 */
  private readonly baseUrl: string;

  /** 内部 API Key */
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.BILLING_SERVICE_URL ?? 'http://billing-service:3006').replace(/\/$/, '');
    this.apiKey = process.env.INTERNAL_API_KEY ?? '';
  }

  /**
   * 调用 billing-service 赠送积分
   *
   * @param userId 用户 ID
   * @param amount 赠送数量（pointAmount + bonusPoints）
   * @param idempotencyKey 幂等键
   * @param orderId 关联订单 ID
   * @param packageId 关联套餐 ID
   * @returns { balance, success, transactionId }
   */
  async grant(params: {
    userId: string;
    amount: number;
    idempotencyKey: string;
    orderId: string;
    packageId: string;
  }): Promise<GrantResult> {
    const { userId, amount, idempotencyKey, orderId, packageId } = params;

    if (!this.apiKey) {
      this.logger.error('INTERNAL_API_KEY 未配置，无法调用 billing-service');
      throw new Error('INTERNAL_API_KEY 未配置');
    }

    const url = `${this.baseUrl}/api/v1/points/grant`;
    const body = {
      userId,
      amount,
      idempotencyKey,
      orderId,
      packageId,
      description: `订单 ${orderId} 套餐 ${packageId} 赠送积分`,
    };

    this.logger.log(
      `调用 billing-service /grant: userId=${userId} amount=${amount} orderId=${orderId}`,
    );

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      this.logger.error(
        `billing-service /grant 调用失败: status=${resp.status} body=${text}`,
      );
      throw new Error(`billing-service grant 失败: HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as {
      code?: number;
      message?: string;
      data?: { balance?: number; transactionId?: string; success?: boolean };
    };

    // billing-service 返回统一 ApiResponse 格式
    const data = json.data ?? {};
    return {
      balance: Number(data.balance ?? 0),
      success: data.success !== false,
      transactionId: data.transactionId,
    };
  }
}
