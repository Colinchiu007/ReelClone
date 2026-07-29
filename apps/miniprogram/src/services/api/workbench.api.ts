/**
 * Workbench API —— 工作台服务（生成任务 + 作品）
 *
 * 端点（前缀 /generations、/works）：
 *  - POST   /generations           提交生成任务
 *  - GET    /generations           任务列表（分页）
 *  - GET    /generations/:id       任务详情
 *  - POST   /generations/:id/cancel 取消任务
 *  - POST   /generations/:id/retry  重试任务
 *  - GET    /works                 作品列表（分页）
 *  - GET    /works/:id             作品详情
 *  - DELETE /works/:id             删除作品
 */
import { request } from '../request';
import type {
  CreateGenerationParams,
  GenerationTask,
  PaginatedResponse,
  PaginationParams,
  Work,
} from '@/types';

/** 提交生成任务 */
export function createGeneration(
  data: CreateGenerationParams,
): Promise<{ workId: string; taskId: string }> {
  return request.post<{ workId: string; taskId: string }>('/generations', data);
}

/** 生成任务列表（分页 + 筛选） */
export function listGenerations(
  params?: { status?: string; generationType?: string } & PaginationParams,
): Promise<PaginatedResponse<GenerationTask>> {
  return request.get<PaginatedResponse<GenerationTask>>(
    '/generations',
    params as Record<string, unknown>,
  );
}

/** 生成任务详情 */
export function getGeneration(id: string): Promise<GenerationTask> {
  return request.get<GenerationTask>(`/generations/${id}`);
}

/** 取消生成任务 */
export function cancelGeneration(id: string): Promise<void> {
  return request.post<void>(`/generations/${id}/cancel`);
}

/** 重试生成任务 */
export function retryGeneration(id: string): Promise<{ taskId: string }> {
  return request.post<{ taskId: string }>(`/generations/${id}/retry`);
}

/** 作品列表（分页 + 筛选） */
export function listWorks(
  params?: { status?: string; workType?: string } & PaginationParams,
): Promise<PaginatedResponse<Work>> {
  return request.get<PaginatedResponse<Work>>('/works', params as Record<string, unknown>);
}

/** 作品详情 */
export function getWork(id: string): Promise<Work> {
  return request.get<Work>(`/works/${id}`);
}

/** 删除作品（软删除） */
export function deleteWork(id: string): Promise<void> {
  return request.delete<void>(`/works/${id}`);
}
