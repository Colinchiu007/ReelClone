/**
 * Asset API —— 资产服务
 *
 * 端点（前缀 /assets、/avatar-groups）：
 *  - POST   /assets/upload-token    获取 STS 上传凭证
 *  - GET    /assets                 资产列表（分页 + 筛选）
 *  - POST   /assets                 创建资产记录
 *  - DELETE /assets/:id             删除资产
 *  - GET    /avatar-groups          形象组列表
 *  - POST   /avatar-groups          创建形象组
 *  - DELETE /avatar-groups/:id      删除形象组
 */
import { request } from '../request';
import type { Asset, AvatarGroup, PaginatedResponse, PaginationParams, UploadToken } from '@/types';

/** 获取 STS 上传凭证 */
export function getUploadToken(fileType: string, fileName: string): Promise<UploadToken> {
  return request.post<UploadToken>('/assets/upload-token', { fileType, fileName });
}

/** 资产列表（分页 + 筛选） */
export function listAssets(
  params?: { assetType?: string; industry?: string; keyword?: string } & PaginationParams,
): Promise<PaginatedResponse<Asset>> {
  return request.get<PaginatedResponse<Asset>>('/assets', params as Record<string, unknown>);
}

/** 创建资产记录（直传 OSS 完成后登记） */
export function createAsset(data: Partial<Asset>): Promise<Asset> {
  return request.post<Asset>('/assets', data);
}

/** 删除资产 */
export function deleteAsset(id: string): Promise<void> {
  return request.delete<void>(`/assets/${id}`);
}

/** 真人形象组列表 */
export function listAvatarGroups(): Promise<AvatarGroup[]> {
  return request.get<AvatarGroup[]>('/avatar-groups');
}

/** 创建真人形象组 */
export function createAvatarGroup(data: { name: string; description?: string }): Promise<AvatarGroup> {
  return request.post<AvatarGroup>('/avatar-groups', data);
}

/** 删除真人形象组 */
export function deleteAvatarGroup(id: string): Promise<void> {
  return request.delete<void>(`/avatar-groups/${id}`);
}
