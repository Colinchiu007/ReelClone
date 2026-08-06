/**
 * Token 管理
 *
 * 职责：
 *  1. Token 存储与读取（基于 Taro 同步存储）
 *  2. JWT 过期时间解析，判断是否快过期（提前 5 分钟刷新）
 *  3. Token 刷新锁（防止并发刷新，多个 401 请求共享同一个刷新 Promise）
 *
 * 注意：refreshAccessToken 使用原生 Taro.request 直接调用刷新接口，
 *       不经过 RequestManager，以避免循环依赖。
 */
import Taro from '@tarojs/taro';

/** 由 Taro defineConstants 注入的全局 API 基础地址 */
declare const API_BASE_URL: string | undefined;

const ACCESS_TOKEN_KEY = 'rc_access_token';
const REFRESH_TOKEN_KEY = 'rc_refresh_token';
const TOKEN_EXPIRE_KEY = 'rc_token_expire';

/** 提前刷新时间（5 分钟，单位 ms） */
const REFRESH_AHEAD_MS = 5 * 60 * 1000;

/**
 * 从 JWT payload 中解析过期时间（exp，秒级时间戳）
 * JWT 格式：header.payload.signature，payload 为 base64url 编码的 JSON
 *
 * 使用 Taro.base64ToArrayBuffer 解码，兼容微信小程序环境（无 atob）
 */
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 + 补齐 padding
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const bytes = new Uint8Array(Taro.base64ToArrayBuffer(b64));
    // UTF-8 bytes → string
    const json = decodeURIComponent(
      Array.from(bytes, (b) => '%' + ('00' + b.toString(16)).slice(-2)).join(''),
    );
    const decoded = JSON.parse(json) as { exp?: number };
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

/**
 * Token 存储
 * 提供同步的 Token 读写接口，供 RequestManager 在拦截器中同步注入
 */
export const tokenStore = {
  getAccessToken(): string | null {
    return Taro.getStorageSync(ACCESS_TOKEN_KEY) || null;
  },

  getRefreshToken(): string | null {
    return Taro.getStorageSync(REFRESH_TOKEN_KEY) || null;
  },

  setTokens(accessToken: string, refreshToken: string): void {
    Taro.setStorageSync(ACCESS_TOKEN_KEY, accessToken);
    Taro.setStorageSync(REFRESH_TOKEN_KEY, refreshToken);
    // 解析过期时间并缓存（毫秒级时间戳）
    const exp = decodeJwtExp(accessToken);
    if (exp) {
      Taro.setStorageSync(TOKEN_EXPIRE_KEY, String(exp * 1000));
    } else {
      Taro.removeStorageSync(TOKEN_EXPIRE_KEY);
    }
  },

  clear(): void {
    Taro.removeStorageSync(ACCESS_TOKEN_KEY);
    Taro.removeStorageSync(REFRESH_TOKEN_KEY);
    Taro.removeStorageSync(TOKEN_EXPIRE_KEY);
  },

  /** 检查是否快过期（提前 5 分钟刷新） */
  isExpiringSoon(): boolean {
    const expStr = Taro.getStorageSync(TOKEN_EXPIRE_KEY);
    if (!expStr) return true; // 无过期信息，视为需要刷新
    const exp = Number(expStr);
    if (!exp || Number.isNaN(exp)) return true;
    return Date.now() > exp - REFRESH_AHEAD_MS;
  },
};

/** 刷新锁：防止并发刷新（多个 401 请求共享同一个 Promise） */
let refreshPromise: Promise<string> | null = null;

/**
 * 刷新 Access Token
 *
 * - 若已有刷新进行中，直接返回同一 Promise（防并发）
 * - 使用原生 Taro.request 调用 /auth/refresh-token，不经过 RequestManager
 * - 刷新成功：存储新 Token 并返回 accessToken
 * - 刷新失败：清除 Token 并抛出异常（由调用方处理跳转登录）
 */
export async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    throw new Error('无可用的 refreshToken');
  }

  const baseUrl =
    API_BASE_URL ??
    (process.env.NODE_ENV === 'production' ? 'https://api.reelclone.com/api' : 'http://localhost:3000/api');

  refreshPromise = (async () => {
    try {
      const res = await Taro.request({
        url: `${baseUrl}/auth/refresh-token`,
        method: 'POST',
        data: { refreshToken },
        timeout: 15000,
      });

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`刷新 Token 失败 (${res.statusCode})`);
      }

      const body = res.data as { code: number; data?: { accessToken: string; refreshToken: string } };
      if (body.code !== 0 || !body.data) {
        throw new Error(body.data ? '刷新 Token 业务错误' : '刷新 Token 响应异常');
      }

      const { accessToken, refreshToken: newRefreshToken } = body.data;
      tokenStore.setTokens(accessToken, newRefreshToken);
      return accessToken;
    } finally {
      // 清除刷新锁，无论成功或失败
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
