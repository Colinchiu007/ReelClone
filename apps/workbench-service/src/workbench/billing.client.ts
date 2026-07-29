/**
 * BillingClient — 调用 billing-service 的 HTTP 客户端
 *
 * 使用 axios 直接调用 billing-service 内部 API：
 *  - POST /api/v1/points/freeze   冻结积分（任务提交时）
 *  - POST /api/v1/points/settle  结算冻结积分（任务成功后）
 *  - POST /api/v1/points/release 释放冻结积分（任务取消/失败时）
 *
 * 鉴权：通过 x-api-key Header 携带 INTERNAL_API_KEY
 * 幂等：每次调用传入 idempotencyKey，billing-service 保证重复请求返回首次结果
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, type AxiosInstance } from 'axios';
import { BusinessException, ErrorCode } from '@reelclone/common';

/** 冻结响应 */
export interface FreezeResult {
  /** 冻结金额 */
  frozenAmount: number;
  /** 操作后余额 */
  balance: number;
  /** 冻结流水 ID（后续 settle/release 复用） */
  freezeId: string;
}

/** 结算/释放响应 */
export interface OperationResult {
  /** 操作后余额 */
  balance: number;
  /** 流水 ID */
  transactionId: string;
}

/** billing-service 响应体（ApiResponse 包裹） */
interface BillingApiResponse<T> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
}

/** billing-service 内部操作 data 结构 */
interface BillingOperationData {
  success: boolean;
  frozenAmount?: number;
  balance: number;
  transactionId: string;
}

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('BILLING_SERVICE_URL') ||
      process.env.BILLING_SERVICE_URL ||
      'http://localhost:3006';
    const apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') ||
      process.env.INTERNAL_API_KEY ||
      '';

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
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
    const data = await this.post<BillingOperationData>('/api/v1/points/freeze', {
      userId,
      amount,
      idempotencyKey,
      workId,
      description: `workbench:freeze:${workId}`,
    });

    return {
      frozenAmount: data.frozenAmount ?? amount,
      balance: data.balance,
      freezeId: data.transactionId,
    };
  }

  /**
   * 结算冻结积分（任务成功后按实际用量结算）
   * @param userId 用户 ID
   * @param amount 实际消耗数量
   * @param idempotencyKey 幂等键
   * @param workId 关联作品 ID
   * @param freezeId 原冻结流水 ID
   */
  async settle(
    userId: string,
    amount: number,
    idempotencyKey: string,
    workId: string,
    freezeId: string,
  ): Promise<OperationResult> {
    const data = await this.post<BillingOperationData>('/api/v1/points/settle', {
      userId,
      amount,
      idempotencyKey,
      freezeId,
      workId,
      description: `workbench:settle:${workId}`,
    });

    return {
      balance: data.balance,
      transactionId: data.transactionId,
    };
  }

  /**
   * 释放冻结积分（任务取消/失败时）
   * @param userId 用户 ID
   * @param amount 释放数量
   * @param idempotencyKey 幂等键
   * @param freezeId 原冻结流水 ID
   */
  async release(
    userId: string,
    amount: number,
    idempotencyKey: string,
    freezeId: string,
  ): Promise<OperationResult> {
    const data = await this.post<BillingOperationData>('/api/v1/points/release', {
      userId,
      amount,
      idempotencyKey,
      freezeId,
      description: `workbench:release`,
    });

    return {
      balance: data.balance,
      transactionId: data.transactionId,
    };
  }

  /**
   * 统一 POST 请求封装
   * - 解析 ApiResponse 包裹，提取 data
   * - billing-service 返回 INSUFFICIENT_CREDITS 时抛对应业务异常
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    try {
      const response = await this.httpClient.post<BillingApiResponse<T>>(
        path,
        body,
      );

      const resp = response.data;

      // billing-service 返回业务错误码
      if (resp.code !== ErrorCode.SUCCESS) {
        // 积分不足
        if (resp.code === ErrorCode.INSUFFICIENT_CREDITS) {
          throw BusinessException.insufficientCredits(resp.message);
        }
        // 其他业务错误
        throw new BusinessException(
          resp.code as ErrorCode,
          resp.message || 'billing-service 调用失败',
        );
      }

      return resp.data;
    } catch (err) {
      // 已是 BusinessException，直接抛出
      if (err instanceof BusinessException) {
        throw err;
      }

      // Axios 错误：尝试解析 billing-service 返回的 ApiResponse
      const axiosErr = err as AxiosError<BillingApiResponse<unknown>>;
      const respData = axiosErr.response?.data;
      if (respData && typeof respData.code === 'number') {
        if (respData.code === ErrorCode.INSUFFICIENT_CREDITS) {
          throw BusinessException.insufficientCredits(respData.message);
        }
        throw new BusinessException(
          respData.code as ErrorCode,
          respData.message || 'billing-service 调用失败',
        );
      }

      // 网络错误等
      this.logger.error(
        `调用 billing-service 失败: ${path} ${(err as Error).message}`,
      );
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        '计费服务暂时不可用，请稍后重试',
        { path, message: (err as Error).message },
      );
    }
  }
}
