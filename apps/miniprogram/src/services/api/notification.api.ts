/**
 * Notification API —— 通知服务
 *
 * 端点（前缀 /notifications）：
 *  - GET  /notifications              通知列表（分页 + 筛选）
 *  - GET  /notifications/unread-count  未读数量
 *  - POST /notifications/read-all     全部标记已读
 *  - POST /notifications/:id/read     标记单条已读
 */
import { request } from '../request';
import type { Notification, PaginatedResponse, PaginationParams } from '@/types';

/** 通知列表（分页 + 筛选） */
export function listNotifications(
  params?: { type?: string; isRead?: boolean } & PaginationParams,
): Promise<PaginatedResponse<Notification>> {
  return request.get<PaginatedResponse<Notification>>(
    '/notifications',
    params as Record<string, unknown>,
  );
}

/** 标记单条通知已读 */
export function markAsRead(id: string): Promise<void> {
  return request.post<void>(`/notifications/${id}/read`);
}

/** 全部标记已读 */
export function markAllAsRead(): Promise<void> {
  return request.post<void>('/notifications/read-all');
}

/** 获取未读通知数量 */
export function getUnreadCount(): Promise<number> {
  return request
    .get<{ count: number }>('/notifications/unread-count')
    .then((res) => res.count);
}
