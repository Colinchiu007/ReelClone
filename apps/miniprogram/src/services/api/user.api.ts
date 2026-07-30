/**
 * User API —— 用户服务
 *
 * 端点（前缀 /users、/sms）：
 *  - GET  /users/me           获取当前用户
 *  - PUT  /users/me           更新用户信息
 *  - POST /users/bind-mobile  绑定手机号
 *  - PUT  /users/password     修改密码
 *  - GET  /users/:id/profile  公开用户主页（昵称+头像+模板统计）
 *  - POST /sms/send           发送短信验证码
 */
import { request } from '../request'
import type { User, UserProfile } from '@/types'

/** 获取当前登录用户信息 */
export function getCurrentUser(): Promise<User> {
  return request.get<User>('/users/me')
}

/** 更新用户信息 */
export function updateUser(
  data: Partial<Pick<User, 'nickname' | 'avatarUrl' | 'email' | 'industryPreferences'>>,
): Promise<User> {
  return request.put<User>('/users/me', data)
}

/** 绑定手机号 */
export function bindMobile(mobile: string, code: string): Promise<User> {
  return request.post<User>('/users/bind-mobile', { mobile, code })
}

/** 修改密码（已设置密码用旧密码验证，未设置密码用短信验证码验证） */
export function changePassword(data: {
  oldPassword?: string
  newPassword: string
  code?: string
}): Promise<void> {
  return request.put<void>('/users/password', data)
}

/** 发送短信验证码 */
export function sendSms(mobile: string, purpose: string): Promise<void> {
  return request.post<void>('/sms/send', { mobile, purpose })
}

/**
 * 公开用户主页（GET /users/:id/profile）
 * 返回昵称、头像、上传模板数、模板被使用总数。
 * 用于模板广场点击上传者头像查看主页。
 */
export function getUserProfile(userId: string): Promise<UserProfile> {
  return request.get<UserProfile>(`/users/${userId}/profile`)
}
