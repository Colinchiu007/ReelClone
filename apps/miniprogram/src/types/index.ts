/**
 * ReelClone 小程序 —— 全局类型定义
 *
 * 与后端 @reelclone/common 的 ApiResponse / PaginatedResponse 结构保持一致。
 * 实体类型对应 libs/database/src/entities 下的各 Entity 字段。
 */

// -------------------- 通用 API 响应 --------------------

/** 统一响应结构：{ code, message, data, traceId } */
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** 分页响应结构 */
export interface PaginatedResponse<T> {
  code: number
  message: string
  data: {
    list: T[]
    page: number
    pageSize: number
    total: number
  }
}

/** 分页查询参数 */
export interface PaginationParams {
  page?: number
  pageSize?: number
}

// -------------------- User --------------------

export interface User {
  id: string
  openId: string
  nickname: string
  avatarUrl: string | null
  mobile: string | null
  email: string | null
  currentPoints: number
  totalPoints: number
  industryPreferences: string[]
  status: string
  createdAt: string
}

// -------------------- Auth --------------------

export interface LoginResult {
  accessToken: string
  refreshToken: string
  user: User
  isNewUser: boolean
}

// -------------------- Work / Generation --------------------

export interface Work {
  id: string
  userId: string
  workType: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  subStatus?: string
  params: Record<string, unknown>
  resultUrl?: string
  coverUrl?: string
  consumedPoints: number
  createdAt: string
  completedAt?: string
}

export interface GenerationTask {
  id: string
  workId: string
  taskType: string
  provider: string
  status: string
  retryCount: number
  errorMessage?: string
}

/** 提交生成任务参数（对应后端 CreateGenerationDto） */
export interface CreateGenerationParams {
  generationType: string
  prompt: string
  model?: string
  resolution?: string
  aspectRatio?: string
  duration?: 5 | 10
  referenceImages?: string[]
  referenceVideo?: string
  referenceAudio?: string
  firstFrame?: string
  lastFrame?: string
  idempotencyKey?: string
  /** 对标解析复刻：关联的对标 ID */
  benchmarkId?: string
}

// -------------------- Asset --------------------

export interface Asset {
  id: string
  userId: string
  avatarGroupId?: string
  assetType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MATERIAL' | 'FINISHED'
  status: string
  storageKey: string
  fileName: string
  fileSize: number
  duration?: number
  metadata: Record<string, unknown>
  tags: string[]
  industry?: string
  createdAt: string
}

export interface AvatarGroup {
  id: string
  userId: string
  name: string
  description?: string
  avatarCount: number
  authorizationStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  status: string
  createdAt: string
}

export interface UploadToken {
  uploadUrl: string
  key: string
  token: string
  expireAt: string
}

// -------------------- Benchmark --------------------

export interface Benchmark {
  id: string
  userId: string
  sourceUrl: string
  platform: string
  status: string
  consumedPoints: number
  analysisResult?: Record<string, unknown>
  shots?: unknown[]
  transcript?: unknown[]
  ocrResult?: unknown[]
  visualDescription?: unknown[]
  errorMessage?: string
  createdAt: string
  completedAt?: string
}

// -------------------- Template --------------------

/** 模板状态枚举（与后端 TemplateStatus 对齐） */
export type TemplateStatus =
  'ACTIVE' | 'OFFLINE' | 'PENDING_REVIEW' | 'REJECTED' | 'ANALYZING' | 'ANALYSIS_FAILED'

export interface Template {
  id: string
  title: string
  description?: string
  platform: string
  industries: string[]
  tags: string[]
  coverUrl: string
  videoUrl: string
  author: string
  /** 上传者用户 ID（用户上传视频转模板时有值） */
  authorId?: string
  /** 上传者头像 URL */
  authorAvatar?: string
  /** 上传者已上传模板数（聚合统计） */
  authorUploadCount?: number
  /** 上传者模板被使用总数（聚合统计） */
  authorUsedCount?: number
  playCount: number
  iqScore: number
  heat: number
  published: boolean
  /** 模板状态：默认 ACTIVE，用户上传转模板时有 ANALYZING/ANALYSIS_FAILED */
  status?: TemplateStatus
  /** 分析失败原因（status=ANALYSIS_FAILED 时有值） */
  failureReason?: string
  /** Temporal 工作流 ID（用户上传转模板时有值） */
  workflowId?: string
  createdAt: string
}

export interface Favorite {
  id: string
  userId: string
  templateId: string
  createdAt: string
}

/** 提交视频转模板参数（对应后端 UploadTemplateDto） */
export interface UploadTemplateParams {
  assetId: string
  title: string
  description?: string
  category?: string
  industry?: string
  platform?: string
  tags?: string[]
}

/** 提交视频转模板响应 */
export interface UploadResult {
  templateId: string
  workflowId: string
  status: TemplateStatus
}

/** 查询转模板进度响应 */
export interface UploadStatusResult {
  templateId: string
  workflowId: string
  status: TemplateStatus
  failureReason?: string
}

/** 公开用户主页信息（GET /users/:id/profile） */
export interface UserProfile {
  userId: string
  nickname: string
  avatarUrl: string | null
  templateUploadCount: number
  templateUsedCount: number
}

// -------------------- Billing --------------------

export interface PointBalance {
  balance: number
  frozen: number
  total: number
}

export interface PointTransaction {
  id: string
  userId: string
  workId?: string
  orderId?: string
  type: string
  direction: string
  amount: number
  balance: number
  description?: string
  createdAt: string
}

// -------------------- Order / Package --------------------

export interface Package {
  id: string
  name: string
  code: string
  type: string
  price: number
  originalPrice?: number
  pointAmount: number
  bonusPoints: number
  durationDays: number
  description?: string
}

export interface Order {
  id: string
  userId: string
  packageId: string
  orderNo: string
  amount: number
  pointAmount: number
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED'
  paymentMethod: string
  transactionId?: string
  paidAt?: string
  createdAt: string
}

/** 微信小程序支付参数（调起 wx.requestPayment） */
export interface WechatPayParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

// -------------------- Notification --------------------

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  content: string
  metadata: Record<string, unknown>
  isRead: boolean
  createdAt: string
}
