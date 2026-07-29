/**
 * axios 实例 + 统一请求封装
 *
 * - baseURL 为空：通过 Vite proxy 转发 /api → http://localhost:3011
 * - 请求拦截器：自动注入 Authorization: Bearer {token}
 * - 响应拦截器：401 时清除 token + 跳转登录页；其他错误 message.error
 * - http<T>() 辅助函数：解包 ApiResponse ({ code, message, data }) → data
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { clearAuth } from '../stores/auth'

/** 后端统一响应格式 */
interface ApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

const apiClient = axios.create({
  baseURL: '',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：注入 JWT
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：401 跳登录 + 统一错误提示
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const err = error as {
      response?: { status?: number; data?: { message?: string } }
      message?: string
    }
    const status = err?.response?.status

    if (status === 401) {
      clearAuth()
      message.error('登录已过期，请重新登录')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    const msg = err?.response?.data?.message || err?.message || '网络错误，请稍后重试'
    message.error(msg)
    return Promise.reject(error)
  },
)

/**
 * 统一请求函数：解包 ApiResponse，返回 data 字段
 *
 * 业务错误（code !== 0）也会触发 message.error 并抛出。
 */
export async function http<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.request<ApiResponse<T>>(config)
  const body = res.data
  if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
    return body as unknown as T
  }
  if (body.code !== 0) {
    message.error(body.message || '请求失败')
    throw new Error(body.message || '请求失败')
  }
  return body.data
}

export default apiClient
