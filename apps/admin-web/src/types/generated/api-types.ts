/**
 * 适配层 — admin-web 版本
 *
 * 与 miniprogram 版本结构一致，仅路径独立。
 * 新增服务时需要追加对应别名。
 *
 * 导入规范：生成的 .ts 文件用 `export interface components {}` 直接命名导出，
 *   因此本文件用 `import type { components } from './auth'` 引用；
 *   不要用 `import { auth } from './auth'`（./auth 没有名为 auth 的命名导出），
 *   也不要用 `import * as auth from './auth'`（namespace 不能用作 indexed access type）。
 */
import type { components as authComponents } from './auth'

// -------------------- 通用响应 --------------------
export type ApiResponse<T> = authComponents['schemas']['ApiResponseWrapper'] & {
  data?: T
}

// -------------------- Auth 请求 DTO --------------------
export type AdminLoginDto = authComponents['schemas']['AdminLoginDto']
export type WechatLoginDto = authComponents['schemas']['WechatLoginDto']
export type RefreshTokenDto = authComponents['schemas']['RefreshTokenDto']

// -------------------- Auth 响应 --------------------
export type AdminLoginResult = authComponents['schemas']['AdminLoginResultDto']
export type WxLoginResult = authComponents['schemas']['WxLoginResultDto']
export type RefreshTokenResult = authComponents['schemas']['RefreshTokenResultDto']
export type AuthUserResponse = authComponents['schemas']['AuthUserResponseDto']
export type AdminUserInfo = authComponents['schemas']['AdminUserInfoDto']
export type LogoutResult = authComponents['schemas']['LogoutResultDto']
export type HealthResult = authComponents['schemas']['HealthResultDto']

// -------------------- Auth 枚举（从生成类型提取） --------------------
export type UserRole = authComponents['schemas']['AdminUserInfoDto']['role']
export type UserStatus = authComponents['schemas']['AuthUserResponseDto']['status']
