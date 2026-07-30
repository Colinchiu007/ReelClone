/**
 * 适配层 — 将生成类型的深层嵌套结构暴露出扁平命名
 *
 * 生成类型（如 auth.ts）的结构是：
 *   components["schemas"]["WxLoginResultDto"]
 *   operations["wxLogin"]["responses"][200]["content"]["application/json"]
 *
 * 本文件提供扁平别名，让 API 层代码可读性更高：
 *   import type { WxLoginResult, WechatLoginDto } from '@/types/generated/api-types'
 *
 * 注意：本文件手工维护，新增服务时需要追加对应别名。
 *
 * 导入规范：生成的 .ts 文件用 `export interface components {}` 直接命名导出，
 *   因此本文件用 `import type { components } from './auth'` 引用；
 *   不要用 `import { auth } from './auth'`（./auth 没有名为 auth 的命名导出），
 *   也不要用 `import * as auth from './auth'`（namespace 不能用作 indexed access type）。
 *
 * 跨服务重名处理：billing-service 和 admin-service 都有 GrantPointsDto（结构不同），
 *   template-service 和 admin-service 都有 ReviewTemplateDto（枚举值不同）。
 *   用服务名前缀区分：AdminGrantPointsDto / BillingGrantPointsDto。
 */
import type { components as authComponents } from './auth'
import type { components as userComponents } from './user'
import type { components as assetComponents } from './asset'
import type { components as benchmarkComponents } from './benchmark'
import type { components as billingComponents } from './billing'
import type { components as templateComponents } from './template'
import type { components as workbenchComponents } from './workbench'
import type { components as orderComponents } from './order'
import type { components as adminComponents } from './admin'

// -------------------- 通用响应 --------------------
export type ApiResponse<T> = authComponents['schemas']['ApiResponseWrapper'] & {
  data?: T
}

// ============================================================
// Auth 服务
// ============================================================
export type AdminLoginDto = authComponents['schemas']['AdminLoginDto']
export type WechatLoginDto = authComponents['schemas']['WechatLoginDto']
export type RefreshTokenDto = authComponents['schemas']['RefreshTokenDto']

export type AdminLoginResult = authComponents['schemas']['AdminLoginResultDto']
export type WxLoginResult = authComponents['schemas']['WxLoginResultDto']
export type RefreshTokenResult = authComponents['schemas']['RefreshTokenResultDto']
export type AuthUserResponse = authComponents['schemas']['AuthUserResponseDto']
export type AdminUserInfo = authComponents['schemas']['AdminUserInfoDto']
export type LogoutResult = authComponents['schemas']['LogoutResultDto']
export type HealthResult = authComponents['schemas']['HealthResultDto']

// Auth 枚举
export type UserRole = authComponents['schemas']['AdminUserInfoDto']['role']
export type UserStatus = authComponents['schemas']['AuthUserResponseDto']['status']

// ============================================================
// User 服务
// ============================================================
export type UpdateUserDto = userComponents['schemas']['UpdateUserDto']
export type BindMobileDto = userComponents['schemas']['BindMobileDto']
export type ChangePasswordDto = userComponents['schemas']['ChangePasswordDto']
export type SendSmsDto = userComponents['schemas']['SendSmsDto']

// User 枚举
export type SmsPurpose = userComponents['schemas']['SendSmsDto']['purpose']

// ============================================================
// Asset 服务
// ============================================================
export type UploadTokenDto = assetComponents['schemas']['UploadTokenDto']
export type CreateAssetDto = assetComponents['schemas']['CreateAssetDto']
export type CreateAvatarGroupDto = assetComponents['schemas']['CreateAvatarGroupDto']
export type UpdateAvatarGroupDto = assetComponents['schemas']['UpdateAvatarGroupDto']

// ============================================================
// Benchmark 服务
// ============================================================
export type CreateBenchmarkDto = benchmarkComponents['schemas']['CreateBenchmarkDto']

// ============================================================
// Billing 服务（内部 API — 幂等键 + 业务上下文）
// ============================================================
export type BillingFreezePointsDto = billingComponents['schemas']['FreezePointsDto']
export type BillingSettlePointsDto = billingComponents['schemas']['SettlePointsDto']
export type BillingReleasePointsDto = billingComponents['schemas']['ReleasePointsDto']
export type BillingGrantPointsDto = billingComponents['schemas']['GrantPointsDto']
export type RewardPointsDto = billingComponents['schemas']['RewardPointsDto']

// ============================================================
// Template 服务
// ============================================================
export type UploadTemplateDto = templateComponents['schemas']['UploadTemplateDto']
export type PublishTemplateDto = templateComponents['schemas']['PublishTemplateDto']
export type FinalizeTemplateInternalDto =
  templateComponents['schemas']['FinalizeTemplateInternalDto']
export type FailTemplateDto = templateComponents['schemas']['FailTemplateDto']
export type TemplateReviewDto = templateComponents['schemas']['ReviewTemplateDto']
export type IndustryPreferenceDto = templateComponents['schemas']['IndustryPreferenceDto']

// Template 枚举
export type TemplateReviewStatus = templateComponents['schemas']['ReviewTemplateDto']['status']

// ============================================================
// Workbench 服务
// ============================================================
export type CreateGenerationDto = workbenchComponents['schemas']['CreateGenerationDto']
export type PublishFromWorkDto = workbenchComponents['schemas']['PublishFromWorkDto']

// ============================================================
// Order 服务
// 注意：order-service 的 schemas 中 `Object` 是 NestJS 自动生成的占位符，
//   非业务 DTO，不在此暴露。
// ============================================================
export type CreateOrderDto = orderComponents['schemas']['CreateOrderDto']

// ============================================================
// Admin 服务（运营后台 — 跨域管理）
// ============================================================
export type UpdateUserStatusDto = adminComponents['schemas']['UpdateUserStatusDto']
export type UpdateUserRoleDto = adminComponents['schemas']['UpdateUserRoleDto']
export type AdminGrantPointsDto = adminComponents['schemas']['GrantPointsDto']
export type AdminReviewTemplateDto = adminComponents['schemas']['ReviewTemplateDto']
export type ReviewAvatarGroupDto = adminComponents['schemas']['ReviewAvatarGroupDto']
export type TakedownWorkDto = adminComponents['schemas']['TakedownWorkDto']
export type UpdateTemplateStatusDto = adminComponents['schemas']['UpdateTemplateStatusDto']
export type CreatePackageDto = adminComponents['schemas']['CreatePackageDto']
export type UpdatePackageDto = adminComponents['schemas']['UpdatePackageDto']
export type UpdatePackageStatusDto = adminComponents['schemas']['UpdatePackageStatusDto']
export type RefundOrderDto = adminComponents['schemas']['RefundOrderDto']
export type BroadcastDto = adminComponents['schemas']['BroadcastDto']
export type SendNotificationDto = adminComponents['schemas']['SendNotificationDto']
export type UpdateApiKeysDto = adminComponents['schemas']['UpdateApiKeysDto']

// Admin 枚举
export type AdminTemplateReviewStatus = adminComponents['schemas']['ReviewTemplateDto']['status']
