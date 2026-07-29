/**
 * Template API —— 模板服务
 *
 * 端点（前缀 /templates、/users/industry-preferences）：
 *  - GET    /templates                   模板广场列表（公开，分页 + 筛选 + 排序）
 *  - GET    /templates/favorites         我的收藏列表（分页）
 *  - GET    /templates/:id               模板详情
 *  - POST   /templates/:id/favorite      收藏模板
 *  - DELETE /templates/:id/favorite      取消收藏
 *  - GET    /users/industry-preferences  获取行业偏好
 *  - POST   /users/industry-preferences  设置行业偏好
 */
import { request } from '../request';
import type { PaginatedResponse, PaginationParams, Template } from '@/types';

/** 模板广场列表（分页 + 筛选 + 排序） */
export function listTemplates(
  params?: { platform?: string; industry?: string; keyword?: string; sortBy?: string } & PaginationParams,
): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>(
    '/templates',
    params as Record<string, unknown>,
  );
}

/** 模板详情 */
export function getTemplate(id: string): Promise<Template> {
  return request.get<Template>(`/templates/${id}`);
}

/** 收藏模板 */
export function favoriteTemplate(id: string): Promise<void> {
  return request.post<void>(`/templates/${id}/favorite`);
}

/** 取消收藏 */
export function unfavoriteTemplate(id: string): Promise<void> {
  return request.delete<void>(`/templates/${id}/favorite`);
}

/** 我的收藏列表（分页） */
export function listFavorites(params?: PaginationParams): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>(
    '/templates/favorites',
    params as Record<string, unknown>,
  );
}

/** 获取当前用户的行业偏好 */
export function getIndustryPreferences(): Promise<string[]> {
  return request
    .get<{ industries: string[] }>('/users/industry-preferences')
    .then((res) => res.industries);
}

/** 设置行业偏好（1-3 个行业标签） */
export function setIndustryPreferences(industries: string[]): Promise<void> {
  return request.post<void>('/users/industry-preferences', { industries });
}
