/**
 * BillingClient — billing-service 内部 API 调用客户端
 *
 * 通过内部 API Key（x-api-key）调用 billing-service 的 freeze / release 端点。
 * 使用 axios 直接发起 HTTP 请求（@nestjs/axios 未安装，axios 已在 workspace 中可用）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import { BusinessException, ErrorCode } from '@reelclone/common';

/** 冻结积分响应 */
export interface FreezeResponse {
  success: boolean;
  frozenAmount?: number;
  balance: number;
  transactionId: string;
}

/** 释放积分响应 */
export interface ReleaseResponse {
  success: boolean;
  frozenAmount?: number;
  balance: number;
  transactionId: string;
}

/** 冻结积分请求参数 */
export interface FreezeParams {
  userId: string;
  amount: number;
  idempotencyKey: string;
  benchmarkId?: string;
  description?: string;
}

/** 释放积分请求参数 */
export interface ReleaseParams {
  userId: string;
  amount: number;
  idempotencyKey: string;
  freezeId: string;
  description?: string;
}

/**
 * billing-service 统一响应体（ApiResponse 包裹）
 * 控制器返回值会被全局 ResponseInterceptor 包装为该结构。
 */
interface BillingApiResponse<T> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
}

@Injectable()
export class BillingClient {
  private readonly logger = new Logger(BillingClient.name);
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    const baseUrl =
      this.configService.get<string>('BILLING_SERVICE_URL') ||
      process.env.BILLING_SERVICE_URL ||
      'http://billing-service:3006';
    this.apiKey =
      this.configService.get<string>('INTERNAL_API_KEY') ||
      process.env.INTERNAL_API_KEY ||
      '';

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 冻结积分
   * POST /api/v1/points/freeze
   */
  async freeze(params: FreezeParams): Promise<FreezeResponse> {
    try {
      const response = await this.client.post<BillingApiResponse<FreezeResponse>>(
        '/api/v1/points/freeze',
        {
          userId: params.userId,
          amount: params.amount,
          idempotencyKey: params.idempotencyKey,
          workId: params.benchmarkId,
          description: params.description ?? '对标解析',
        },
      );
      return this.unwrap(response.data, 'freeze');
    } catch (err) {
      this.handleBillingError(err, 'freeze');
    }
  }

  /**
   * 释放积分
   * POST /api/v1/points/release
   */
  async release(params: ReleaseParams): Promise<ReleaseResponse> {
    try {
      const response = await this.client.post<BillingApiResponse<ReleaseResponse>>(
        '/api/v1/points/release',
        {
          userId: params.userId,
          amount: params.amount,
          idempotencyKey: params.idempotencyKey,
          freezeId: params.freezeId,
          description: params.description ?? '对标解析取消',
        },
      );
      return this.unwrap(response.data, 'release');
    } catch (err) {
      this.handleBillingError(err, 'release');
    }
  }

  /**
   * 解包 billing-service 的 ApiResponse
   *
   * billing-service 通过全局 ResponseInterceptor 将返回值包装为：
   *   { code, message, data, traceId }
   * 客户端需提取 `.data` 字段，并校验业务码 code。
   */
  private unwrap<T>(
    resp: BillingApiResponse<T>,
    action: string,
  ): T {
    if (resp.code !== 0 && resp.code !== undefined) {
      // billing-service 返回业务错误码
      throw new BusinessException(
        resp.code as never,
        resp.message || `billing-service ${action} 失败`,
      );
    }
    return resp.data;
  }

  /**
   * 统一处理 billing-service 错误
   * 将 billing-service 返回的业务错误码透传给调用方
   */
  private handleBillingError(err: unknown, action: string): never {
    this.logger.error(`billing-service ${action} 调用失败: ${this.formatError(err)}`);

    // billing-service 返回的业务错误（含 code/message/data 结构）
    if (axios.isAxiosError(err) && err.response) {
      const data = err.response.data as { code?: number; message?: string } | undefined;
      if (data?.code === ErrorCode.INSUFFICIENT_CREDITS) {
        throw BusinessException.insufficientCredits(data.message ?? '积分不足');
      }
      throw new BusinessException(
        data?.code ?? ErrorCode.INTERNAL_ERROR,
        data?.message ?? `billing-service ${action} 失败`,
        undefined,
        err.response.status,
      );
    }

    // 网络错误或超时
    throw new BusinessException(
      ErrorCode.INTERNAL_ERROR,
      `billing-service ${action} 调用失败: ${this.formatError(err)}`,
    );
  }

  private formatError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
