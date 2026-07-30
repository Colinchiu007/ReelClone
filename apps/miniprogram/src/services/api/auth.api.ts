/**
 * Auth API —— 认证服务
 *
 * 端点（前缀 /auth）：
 *  - POST /auth/wechat-login   微信登录
 *  - POST /auth/refresh-token  刷新 Token
 *  - POST /auth/logout         登出
 *
 * 类型来源：@/types/generated/api-types（由 OpenAPI 自动生成）
 */
import { request } from '../request'
import type { WxLoginResult, RefreshTokenResult, WechatLoginDto } from '@/types/generated/api-types'

/** 微信小程序登录 */
export function wechatLogin(
  code: string,
  nickname?: string,
  avatarUrl?: string,
): Promise<WxLoginResult> {
  const payload: WechatLoginDto = { code, nickname, avatarUrl }
  return request.post<WxLoginResult>('/auth/wechat-login', payload)
}

/** 刷新 Token */
export function refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
  return request.post<RefreshTokenResult>('/auth/refresh-token', {
    refreshToken,
  })
}

/** 登出 */
export async function logout(): Promise<void> {
  await request.post<void>('/auth/logout')
}
