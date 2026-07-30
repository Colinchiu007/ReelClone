/**
 * admin-service API 封装
 *
 * 所有后端接口调用集中于此，页面通过命名导入使用。
 * 响应已由 http() 解包 ApiResponse，直接返回 data 字段。
 */
import { http } from './client'

// ==================== 认证 ====================

export interface AdminLoginResult {
  accessToken: string
  refreshToken: string
  user: { id: string; nickname: string; role: string }
}

export function adminLogin(mobile: string, password: string): Promise<AdminLoginResult> {
  return http<AdminLoginResult>({
    url: '/api/v1/auth/admin-login',
    method: 'POST',
    data: { mobile, password },
  })
}

// ==================== 数据看板 ====================

export type OverviewRange = '7d' | '30d'

export interface OverviewTrends {
  dates: string[]
  dau: number[]
  newUsers: number[]
  gmv: number[]
}

export interface OverviewResult {
  dau: number
  newUsers: number
  gmv: number
  generationCount: number
  pointsConsumed: number
  trends: OverviewTrends
}

export function getOverview(range: OverviewRange): Promise<OverviewResult> {
  return http<OverviewResult>({
    url: '/api/v1/admin/stats/overview',
    method: 'GET',
    params: { range },
  })
}

// -------------------- 积分流水 --------------------

export type PointTxType = 'FREEZE' | 'SETTLE' | 'RELEASE' | 'GRANT' | 'CONSUME'

export interface PointsFlowItem {
  id: string
  userId: string
  type: PointTxType
  amount: number
  balance: number
  source: string | null
  createdAt: string
}

export interface PaginatedPointsFlow {
  list: PointsFlowItem[]
  page: number
  pageSize: number
  total: number
}

export interface ListPointsFlowParams {
  page?: number
  pageSize?: number
  userId?: string
  startDate?: string
  endDate?: string
}

export function listPointsFlow(params: ListPointsFlowParams): Promise<PaginatedPointsFlow> {
  return http<PaginatedPointsFlow>({
    url: '/api/v1/admin/stats/points-flow',
    method: 'GET',
    params,
  })
}

// ==================== 用户管理 ====================

export type UserStatus = 'ACTIVE' | 'FROZEN' | 'DELETED'
export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

export interface User {
  id: string
  openId?: string | null
  unionId?: string | null
  mobile: string | null
  nickname: string
  avatarUrl: string | null
  email: string | null
  currentPoints: number
  totalPoints: number
  industryPreferences?: string[] | null
  status: UserStatus
  role: UserRole
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PaginatedUsers {
  list: User[]
  page: number
  pageSize: number
  total: number
}

export interface ListUsersParams {
  page?: number
  pageSize?: number
  keyword?: string
  status?: UserStatus
  role?: UserRole
}

export function listUsers(params: ListUsersParams): Promise<PaginatedUsers> {
  return http<PaginatedUsers>({ url: '/api/v1/admin/users', method: 'GET', params })
}

export function getUserDetail(id: string): Promise<User> {
  return http<User>({ url: `/api/v1/admin/users/${id}`, method: 'GET' })
}

export function updateUserStatus(id: string, status: UserStatus): Promise<User> {
  return http<User>({ url: `/api/v1/admin/users/${id}/status`, method: 'PUT', data: { status } })
}

export function updateUserRole(id: string, role: UserRole): Promise<User> {
  return http<User>({ url: `/api/v1/admin/users/${id}/role`, method: 'PUT', data: { role } })
}

export function grantPoints(
  id: string,
  amount: number,
  reason: string,
): Promise<{ transactionId: string; balance: number }> {
  return http({
    url: `/api/v1/admin/users/${id}/grant-points`,
    method: 'POST',
    data: { amount, reason },
  })
}

// ==================== 审核工作台 ====================

export type TemplateStatus = 'ACTIVE' | 'OFFLINE' | 'PENDING_REVIEW' | 'REJECTED'
export type AuthorizationStatus = 'PENDING' | 'APPROVED' | 'EXPIRED'

export interface Template {
  id: string
  title: string
  description: string | null
  coverUrl?: string | null
  category?: string | null
  industry?: string | null
  status: TemplateStatus
  userId?: string | null
  reviewNote?: string | null
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AvatarGroup {
  id: string
  name: string
  userId: string
  authorizationStatus: AuthorizationStatus
  authorizationNote?: string | null
  createdAt: string
  updatedAt: string
}

export interface PendingReviewResult {
  templates: Template[]
  avatarGroups: AvatarGroup[]
  total: number
}

export function getPendingReviews(
  type?: 'template' | 'avatar' | 'all',
): Promise<PendingReviewResult> {
  return http<PendingReviewResult>({
    url: '/api/v1/admin/reviews/pending',
    method: 'GET',
    params: { type },
  })
}

export function reviewTemplate(
  id: string,
  status: 'ACTIVE' | 'REJECTED',
  reviewNote?: string,
): Promise<Template> {
  return http<Template>({
    url: `/api/v1/admin/templates/${id}/review`,
    method: 'POST',
    data: { status, reviewNote },
  })
}

export function reviewAvatarGroup(
  id: string,
  status: 'APPROVED' | 'EXPIRED',
  note?: string,
): Promise<AvatarGroup> {
  return http<AvatarGroup>({
    url: `/api/v1/admin/avatar-groups/${id}/authorization`,
    method: 'PUT',
    data: { status, note },
  })
}

// ==================== 内容管理 ====================

export type WorkType = 'TEXT' | 'IMAGE' | 'VIDEO'
export type WorkStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REJECTED' | 'DELETED'

export interface Work {
  id: string
  title: string
  type: WorkType
  status: WorkStatus
  userId: string
  createdAt: string
}

export interface PaginatedWorks {
  list: Work[]
  page: number
  pageSize: number
  total: number
}

export interface ListWorksParams {
  page?: number
  pageSize?: number
  status?: WorkStatus
  userId?: string
  startDate?: string
  endDate?: string
}

export function listWorks(params: ListWorksParams): Promise<PaginatedWorks> {
  return http<PaginatedWorks>({ url: '/api/v1/admin/works', method: 'GET', params })
}

export function takedownWork(
  id: string,
  reason: string,
): Promise<{ id: string; status: WorkStatus }> {
  return http({ url: `/api/v1/admin/works/${id}`, method: 'DELETE', data: { reason } })
}

export function listTemplates(): Promise<Template[]> {
  return http<Template[]>({ url: '/api/v1/admin/templates', method: 'GET' })
}

export function updateTemplateStatus(
  id: string,
  status: 'ACTIVE' | 'OFFLINE',
): Promise<{ id: string; status: TemplateStatus }> {
  return http({ url: `/api/v1/admin/templates/${id}/status`, method: 'PUT', data: { status } })
}

// ==================== 套餐管理 ====================

export type PackageType = 'SUBSCRIPTION' | 'ONE_TIME'
export type PackageStatus = 'ACTIVE' | 'OFFLINE'

export interface Package {
  id: string
  name: string
  description: string | null
  price: number
  originalPrice: number | null
  points: number
  bonusPoints: number
  duration: number | null
  features: string[] | null
  type: PackageType
  status: PackageStatus
  sort: number
  createdAt: string
  updatedAt: string
}

export interface CreatePackagePayload {
  name: string
  description?: string
  price: number
  originalPrice?: number
  points?: number
  bonusPoints?: number
  duration?: number
  features?: string[]
  type: PackageType
  sort?: number
}

export type UpdatePackagePayload = Partial<CreatePackagePayload>

export function listPackages(): Promise<Package[]> {
  return http<Package[]>({ url: '/api/v1/admin/packages', method: 'GET' })
}

export function createPackage(data: CreatePackagePayload): Promise<Package> {
  return http<Package>({ url: '/api/v1/admin/packages', method: 'POST', data })
}

export function updatePackage(id: string, data: UpdatePackagePayload): Promise<Package> {
  return http<Package>({ url: `/api/v1/admin/packages/${id}`, method: 'PUT', data })
}

export function updatePackageStatus(id: string, status: PackageStatus): Promise<Package> {
  return http<Package>({
    url: `/api/v1/admin/packages/${id}/status`,
    method: 'PUT',
    data: { status },
  })
}

// ==================== 订单管理 ====================

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED'

export interface Order {
  id: string
  userId: string
  packageId: string
  amount: number
  status: OrderStatus
  paymentMethod: string
  createdAt: string
}

export interface PaginatedOrders {
  list: Order[]
  page: number
  pageSize: number
  total: number
}

export interface ListOrdersParams {
  page?: number
  pageSize?: number
  status?: OrderStatus
  userId?: string
  startDate?: string
  endDate?: string
}

export function listOrders(params: ListOrdersParams): Promise<PaginatedOrders> {
  return http<PaginatedOrders>({ url: '/api/v1/admin/orders', method: 'GET', params })
}

export function refundOrder(
  id: string,
  reason: string,
): Promise<{ id: string; status: OrderStatus }> {
  return http({ url: `/api/v1/admin/orders/${id}/refund`, method: 'POST', data: { reason } })
}

// ==================== 对账监控 ====================

export interface ReconcileResultItem {
  userId: string
  userBalance: number
  txBalance: number
  frozen: number
  expectedBalance: number
  difference: number
  isConsistent: boolean
}

export interface ReconcileSummary {
  totalUsers: number
  inconsistentCount: number
  results: ReconcileResultItem[]
  date?: string
  startedAt: string
  finishedAt: string
}

export function getReconcileResults(date?: string): Promise<ReconcileResultItem[]> {
  return http<ReconcileResultItem[]>({
    url: '/api/v1/admin/reconcile/results',
    method: 'GET',
    params: { date },
  })
}

export function triggerReconcile(scope: string): Promise<ReconcileSummary> {
  return http<ReconcileSummary>({
    url: '/api/v1/admin/reconcile',
    method: 'POST',
    data: { scope },
  })
}

// ==================== 通知推送 ====================

export interface BroadcastPayload {
  title: string
  content: string
  range: 'all' | 'active'
}

export interface SendNotificationPayload {
  userId: string
  title: string
  content: string
}

export function broadcastNotification(data: BroadcastPayload): Promise<{ success: boolean }> {
  return http({ url: '/api/v1/admin/notifications/broadcast', method: 'POST', data })
}

export function sendNotification(data: SendNotificationPayload): Promise<{ success: boolean }> {
  return http({ url: '/api/v1/admin/notifications/send', method: 'POST', data })
}

// ==================== 系统配置 ====================

export type ApiKeyProvider = 'seedance' | 'llm' | 'oss'

export interface ApiKeyStatus {
  name: string
  keyCount: number
  hasKeys: boolean
}

export interface ApiKeyStatusResult {
  providers: ApiKeyStatus[]
}

export function listApiKeys(): Promise<ApiKeyStatusResult> {
  return http<ApiKeyStatusResult>({ url: '/api/v1/admin/config/api-keys', method: 'GET' })
}

export function updateApiKeys(
  provider: ApiKeyProvider,
  keys: string[],
): Promise<{ success: boolean; provider: string; keyCount: number }> {
  return http({ url: '/api/v1/admin/config/api-keys', method: 'PUT', data: { provider, keys } })
}
