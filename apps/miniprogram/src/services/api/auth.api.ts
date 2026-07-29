/**
 * Auth API —— 认证服务
 *
 * 端点（前缀 /auth）：
 *  - POST /auth/wechat-login   微信登录
 *  - POST /auth/refresh-token  刷新 Token
 *  - POST /auth/logout         登出
 */
import { request } from '../request';
import type { LoginResult } from '@/types';

/** 微信小程序登录 */
export function wechatLogin(
  code: string,
  nickname?: string,
  avatarUrl?: string,
): Promise<LoginResult> {
  return request.post<LoginResult>('/auth/wechat-login', { code, nickname, avatarUrl });
}

/** 刷新 Token */
export function refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return request.post<{ accessToken: string; refreshToken: string }>('/auth/refresh-token', {
    refreshToken,
  });
}

/** 登出 */
export async function logout(): Promise<void> {
  await request.post<void>('/auth/logout');
}
