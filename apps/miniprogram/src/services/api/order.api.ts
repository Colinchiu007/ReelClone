/**
 * Order API —— 订单与套餐服务
 *
 * 端点（前缀 /packages、/orders）：
 *  - GET  /packages          套餐列表（公开）
 *  - GET  /packages/:id      套餐详情（公开）
 *  - POST /orders            创建订单
 *  - GET  /orders            订单列表（分页）
 *  - GET  /orders/:id        订单详情
 *  - POST /orders/:id/cancel 取消订单
 */
import { request } from '../request';
import type { Order, Package, PaginatedResponse, PaginationParams, WechatPayParams } from '@/types';

/** 套餐列表 */
export function listPackages(): Promise<Package[]> {
  return request.get<Package[]>('/packages');
}

/** 套餐详情 */
export function getPackage(id: string): Promise<Package> {
  return request.get<Package>(`/packages/${id}`);
}

/** 创建订单（返回订单信息 + 微信支付参数） */
export function createOrder(
  packageId: string,
  idempotencyKey?: string,
): Promise<{ orderId: string; orderNo: string; paymentParams: WechatPayParams }> {
  return request.post<{ orderId: string; orderNo: string; paymentParams: WechatPayParams }>(
    '/orders',
    { packageId, idempotencyKey },
  );
}

/** 订单列表（分页 + 状态筛选） */
export function listOrders(
  params?: { status?: string } & PaginationParams,
): Promise<PaginatedResponse<Order>> {
  return request.get<PaginatedResponse<Order>>('/orders', params as Record<string, unknown>);
}

/** 订单详情 */
export function getOrder(id: string): Promise<Order> {
  return request.get<Order>(`/orders/${id}`);
}

/** 取消订单（仅 PENDING 状态可取消） */
export function cancelOrder(id: string): Promise<void> {
  return request.post<void>(`/orders/${id}/cancel`);
}
