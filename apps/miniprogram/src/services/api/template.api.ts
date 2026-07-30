/**
 * Template API —— 模板服务
 *
 * 端点（前缀 /templates、/users/industry-preferences）：
 *  - GET    /templates                   模板广场列表（公开，分页 + 筛选 + 排序）
 *  - GET    /templates/favorites         我的收藏列表（分页）
 *  - GET    /templates/:id               模板详情
 *  - POST   /templates/:id/favorite      收藏模板
 *  - DELETE /templates/:id/favorite      取消收藏
 *  - POST   /templates/publish           发布模板（从作品发布）
 *  - GET    /templates/my-published       我发布的模板列表
 *  - POST   /templates/upload            用户上传视频转模板（JWT）
 *  - GET    /templates/upload/:wfId/status  查询转模板进度（JWT）
 *  - GET    /templates/my-uploaded       我上传的模板列表（JWT）
 *  - GET    /users/industry-preferences  获取行业偏好
 *  - POST   /users/industry-preferences  设置行业偏好
 */
import { request } from '../request'
import type {
  PaginatedResponse,
  PaginationParams,
  Template,
  UploadResult,
  UploadStatusResult,
  UploadTemplateParams,
} from '@/types'

/** 模板广场列表（分页 + 筛选 + 排序） */
export function listTemplates(
  params?: {
    platform?: string
    industry?: string
    keyword?: string
    sortBy?: string
  } & PaginationParams,
): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>('/templates', params as Record<string, unknown>)
}

/** 模板详情 */
export function getTemplate(id: string): Promise<Template> {
  return request.get<Template>(`/templates/${id}`)
}

/** 收藏模板 */
export function favoriteTemplate(id: string): Promise<void> {
  return request.post<void>(`/templates/${id}/favorite`)
}

/** 取消收藏 */
export function unfavoriteTemplate(id: string): Promise<void> {
  return request.delete<void>(`/templates/${id}/favorite`)
}

/** 我的收藏列表（分页） */
export function listFavorites(params?: PaginationParams): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>(
    '/templates/favorites',
    params as Record<string, unknown>,
  )
}

/** 获取当前用户的行业偏好 */
export function getIndustryPreferences(): Promise<string[]> {
  return request
    .get<{ industries: string[] }>('/users/industry-preferences')
    .then((res) => res.industries)
}

/** 设置行业偏好（1-3 个行业标签） */
export function setIndustryPreferences(industries: string[]): Promise<void> {
  return request.post<void>('/users/industry-preferences', { industries })
}

/** 发布模板（从作品发布） */
export function publishTemplate(params: {
  title: string
  description?: string
  prompt: string
  coverKey?: string
  videoKey?: string
  sourceWorkId?: string
  category?: string
  industry?: string
  platform?: string
  tags?: string[]
}): Promise<Template> {
  return request.post<Template>('/templates/publish', params)
}

/** 我发布的模板列表 */
export function listMyPublishedTemplates(
  params?: PaginationParams,
): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>(
    '/templates/my-published',
    params as Record<string, unknown>,
  )
}

/**
 * 用户上传视频转模板（JWT）
 * 提交后进入 ANALYZING 状态，Temporal 工作流异步分析视频生成模板。
 */
export function uploadTemplate(params: UploadTemplateParams): Promise<UploadResult> {
  return request.post<UploadResult>('/templates/upload', params)
}

/**
 * 查询上传转模板进度（JWT）
 * 前端轮询此接口获取状态（ANALYZING → ACTIVE / ANALYSIS_FAILED）。
 */
export function getUploadStatus(workflowId: string): Promise<UploadStatusResult> {
  return request.get<UploadStatusResult>(`/templates/upload/${workflowId}/status`)
}

/**
 * 我上传的模板列表（JWT）
 * 包含 ACTIVE / ANALYZING / ANALYSIS_FAILED 三种状态。
 */
export function listMyUploaded(params?: PaginationParams): Promise<PaginatedResponse<Template>> {
  return request.get<PaginatedResponse<Template>>(
    '/templates/my-uploaded',
    params as Record<string, unknown>,
  )
}
