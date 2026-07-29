/**
 * Billing API —— 积分计费服务
 *
 * 端点（前缀 /points）：
 *  - GET /points/balance          积分余额（可用 / 冻结 / 累计）
 *  - GET /points/transactions     积分流水（分页 + 筛选）
 *  - GET /points/transactions/:id 单笔流水详情
 */
import { request } from '../request';
import type { PaginatedResponse, PaginationParams, PointBalance, PointTransaction } from '@/types';

/** 获取积分余额 */
export function getBalance(): Promise<PointBalance> {
  return request.get<PointBalance>('/points/balance');
}

/** 积分流水列表（分页 + 筛选） */
export function listTransactions(
  params?: { type?: string; direction?: string } & PaginationParams,
): Promise<PaginatedResponse<PointTransaction>> {
  return request.get<PaginatedResponse<PointTransaction>>(
    '/points/transactions',
    params as Record<string, unknown>,
  );
}

/** 单笔流水详情 */
export function getTransaction(id: string): Promise<PointTransaction> {
  return request.get<PointTransaction>(`/points/transactions/${id}`);
}
