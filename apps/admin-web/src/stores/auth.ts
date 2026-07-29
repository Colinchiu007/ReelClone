/**
 * 认证状态管理
 *
 * 使用 localStorage 持久化 JWT token + 管理员信息。
 * - getToken / setAuth / clearAuth 供 axios 拦截器与路由守卫使用
 * - getUser 供顶栏展示管理员昵称
 */

export interface AdminUser {
  id: string
  nickname: string
  role: string
}

const TOKEN_KEY = 'admin_token'
const USER_KEY = 'admin_user'

/** 读取 JWT token */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

/** 持久化 token + 用户信息 */
export function setAuth(token: string, user: AdminUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/** 读取当前管理员信息 */
export function getUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AdminUser
  } catch {
    return null
  }
}

/** 清除认证信息（登出 / 401 触发） */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
