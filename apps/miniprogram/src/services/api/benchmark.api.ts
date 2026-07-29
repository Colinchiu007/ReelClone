/**
 * Benchmark API —— 对标解析服务
 *
 * 端点（前缀 /benchmarks）：
 *  - POST /benchmarks            提交对标解析任务
 *  - GET  /benchmarks            解析历史（分页）
 *  - GET  /benchmarks/:id        解析详情
 *  - POST /benchmarks/:id/cancel 取消解析
 */
import { request } from '../request';
import type { Benchmark, PaginatedResponse, PaginationParams } from '@/types';

/** 提交对标解析任务 */
export function createBenchmark(
  data: { sourceUrl: string; idempotencyKey?: string },
): Promise<{ benchmarkId: string; status: string }> {
  return request.post<{ benchmarkId: string; status: string }>('/benchmarks', data);
}

/** 对标解析历史（分页 + 筛选） */
export function listBenchmarks(
  params?: { platform?: string; status?: string } & PaginationParams,
): Promise<PaginatedResponse<Benchmark>> {
  return request.get<PaginatedResponse<Benchmark>>(
    '/benchmarks',
    params as Record<string, unknown>,
  );
}

/** 对标解析详情 */
export function getBenchmark(id: string): Promise<Benchmark> {
  return request.get<Benchmark>(`/benchmarks/${id}`);
}

/** 取消对标解析任务 */
export function cancelBenchmark(id: string): Promise<void> {
  return request.post<void>(`/benchmarks/${id}/cancel`);
}
