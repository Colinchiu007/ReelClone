/**
 * RequestManager —— 统一请求管理器
 *
 * 核心能力：
 *  1. 并发限制：最多 8 个并发请求，超出排队（FIFO 队列）
 *  2. Token 拦截：自动注入 Authorization: Bearer <accessToken>
 *  3. Token 刷新：401 时自动刷新一次并重试原请求；刷新失败则清空登录态
 *  4. 错误统一处理：网络错误 toast 提示，业务错误显示具体 message
 *  5. 超时控制：默认 15s
 *
 * 响应格式遵循后端统一约定：{ code, message, data, traceId }
 *  - code === 0 表示成功，返回 data
 *  - code !== 0 表示业务错误，抛出 RequestError
 */
import Taro from '@tarojs/taro';
import type { ApiResponse } from '@/types';
import { tokenStore, refreshAccessToken } from './token';

/** 由 Taro defineConstants 注入的全局 API 基础地址 */
declare const API_BASE_URL: string | undefined;

/** 请求方法类型 */
type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** 请求选项 */
interface RequestOptions {
  url: string;
  method?: RequestMethod;
  data?: unknown;
  header?: Record<string, string>;
}

/** 统一错误类 */
export class RequestError extends Error {
  constructor(
    public code: number,
    message: string,
    public statusCode?: number,
    public traceId?: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/** 是否正在跳转登录（避免多个 401 同时触发多次跳转） */
let isRedirecting = false;

/** 清空登录态并提示重新登录 */
function handleAuthFailure(): void {
  tokenStore.clear();
  if (!isRedirecting) {
    isRedirecting = true;
    Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2000 });
    // 延迟跳转首页，让 toast 先展示
    setTimeout(() => {
      Taro.reLaunch({ url: '/pages/home/index' });
      isRedirecting = false;
    }, 1500);
  }
}

export class RequestManager {
  private baseUrl: string;
  private concurrencyLimit = 8;
  private queue: Array<() => void> = [];
  private activeCount = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /** 获取并发槽（超出则排队等待） */
  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.concurrencyLimit) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.activeCount++;
        resolve();
      });
    });
  }

  /** 释放并发槽，唤醒队列中下一个请求 */
  private releaseSlot(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * 核心请求方法
   *
   * @param options.url    相对路径，如 /auth/wechat-login
   * @param options.method 请求方法，默认 GET
   * @param options.data   请求数据
   * @param options.header 自定义请求头
   * @returns 解析后的 data 字段
   */
  async request<T>(options: RequestOptions): Promise<T> {
    await this.acquireSlot();
    try {
      // allowRetry=true 表示 401 时可以刷新 Token 并重试一次
      return await this.doRequest<T>(options, true);
    } finally {
      this.releaseSlot();
    }
  }

  /** 实际执行请求 + 401 重试逻辑 */
  private async doRequest<T>(options: RequestOptions, allowRetry: boolean): Promise<T> {
    // 1. 注入 Token
    const header: Record<string, string> = {
      'content-type': 'application/json',
      ...options.header,
    };
    const token = tokenStore.getAccessToken();
    if (token) {
      header.Authorization = `Bearer ${token}`;
    }

    // 2. 发送请求
    let res: Taro.request.SuccessCallbackResult<ApiResponse<T>>;
    try {
      res = await Taro.request({
        url: this.baseUrl + options.url,
        method: options.method ?? 'GET',
        data: options.data as Record<string, unknown> | undefined,
        header,
        timeout: 15000,
      });
    } catch (err) {
      // 网络错误 / 超时
      const msg = (err as Error)?.message?.includes('timeout')
        ? '请求超时，请稍后重试'
        : '网络异常，请检查网络连接';
      Taro.showToast({ title: msg, icon: 'none' });
      throw new RequestError(-1, msg);
    }

    // 3. 401 → 刷新 Token 并重试一次
    if (res.statusCode === 401 && allowRetry) {
      try {
        await refreshAccessToken();
        return this.doRequest<T>(options, false);
      } catch {
        handleAuthFailure();
        throw new RequestError(401, '登录已过期，请重新登录', 401);
      }
    }

    // 4. HTTP 状态码非 2xx
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const body = res.data as ApiResponse<T> | undefined;
      const msg = body?.message || `请求失败 (${res.statusCode})`;
      Taro.showToast({ title: msg, icon: 'none' });
      throw new RequestError(res.statusCode, msg, res.statusCode, body?.traceId);
    }

    // 5. 解析业务响应
    const body = res.data as ApiResponse<T>;
    if (!body || typeof body.code !== 'number') {
      // 响应体不符合统一格式
      throw new RequestError(-1, '响应格式异常', res.statusCode);
    }

    if (body.code !== 0) {
      Taro.showToast({ title: body.message || '请求失败', icon: 'none' });
      throw new RequestError(body.code, body.message, res.statusCode, body.traceId);
    }

    return body.data;
  }

  // -------------------- 便捷方法 --------------------

  get<T>(url: string, data?: Record<string, unknown>, header?: Record<string, string>): Promise<T> {
    return this.request<T>({ url, method: 'GET', data, header });
  }

  post<T>(url: string, data?: unknown, header?: Record<string, string>): Promise<T> {
    return this.request<T>({ url, method: 'POST', data, header });
  }

  put<T>(url: string, data?: unknown, header?: Record<string, string>): Promise<T> {
    return this.request<T>({ url, method: 'PUT', data, header });
  }

  delete<T>(url: string, data?: unknown, header?: Record<string, string>): Promise<T> {
    return this.request<T>({ url, method: 'DELETE', data, header });
  }
}

/** 全局请求实例 */
export const request = new RequestManager(
  API_BASE_URL ??
    (process.env.NODE_ENV === 'production' ? 'https://api.reelclone.com/api' : 'http://localhost:3000/api'),
);
