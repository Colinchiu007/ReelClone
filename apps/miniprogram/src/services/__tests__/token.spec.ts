/**
 * Token Service 单元测试
 *
 * 覆盖场景：
 *  - tokenStore.getAccessToken / getRefreshToken → 存储读写
 *  - tokenStore.setTokens → 存储两个 token + 解析过期时间
 *  - tokenStore.clear → 清除所有 token
 *  - tokenStore.isExpiringSoon → 过期判断逻辑
 *  - refreshAccessToken → 并发去重（同一 Promise）
 *  - refreshAccessToken → 无 refreshToken 时抛错
 *  - refreshAccessToken → 成功刷新后存储新 token
 */
import Taro from '@tarojs/taro'
import { tokenStore, refreshAccessToken } from '../token'

/** 构造一个 JWT token（payload 可自定义 exp） */
function buildJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString('base64url')
  return `${header}.${payload}.signature`
}

describe('tokenStore', () => {
  describe('getAccessToken / getRefreshToken', () => {
    it('无 token 时返回 null', () => {
      expect(tokenStore.getAccessToken()).toBeNull()
      expect(tokenStore.getRefreshToken()).toBeNull()
    })

    it('setTokens 后可读取', () => {
      tokenStore.setTokens('access-123', 'refresh-456')
      expect(tokenStore.getAccessToken()).toBe('access-123')
      expect(tokenStore.getRefreshToken()).toBe('refresh-456')
    })
  })

  describe('setTokens', () => {
    it('应写入 access token 和 refresh token', () => {
      tokenStore.setTokens('access-abc', 'refresh-def')
      expect(Taro.setStorageSync).toHaveBeenCalledWith('rc_access_token', 'access-abc')
      expect(Taro.setStorageSync).toHaveBeenCalledWith('rc_refresh_token', 'refresh-def')
    })

    it('JWT 有 exp 时应解析并缓存过期时间', () => {
      const exp = Math.floor(Date.now() / 1000) + 3600 // 1 小时后过期
      const token = buildJwt(exp)
      tokenStore.setTokens(token, 'refresh-token')

      expect(Taro.setStorageSync).toHaveBeenCalledWith('rc_token_expire', String(exp * 1000))
    })

    it('无 exp 的 JWT 不应写入过期时间', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({ sub: 'test' })).toString('base64url')
      const invalidToken = `${header}.${payload}.sig`

      tokenStore.setTokens(invalidToken, 'refresh-token')
      expect(Taro.removeStorageSync).toHaveBeenCalledWith('rc_token_expire')
    })
  })

  describe('clear', () => {
    it('应清除所有 token 相关存储', () => {
      tokenStore.setTokens('access-123', 'refresh-456')
      tokenStore.clear()

      expect(Taro.removeStorageSync).toHaveBeenCalledWith('rc_access_token')
      expect(Taro.removeStorageSync).toHaveBeenCalledWith('rc_refresh_token')
      expect(Taro.removeStorageSync).toHaveBeenCalledWith('rc_token_expire')
      expect(tokenStore.getAccessToken()).toBeNull()
      expect(tokenStore.getRefreshToken()).toBeNull()
    })
  })

  describe('isExpiringSoon', () => {
    it('无过期信息时返回 true（需刷新）', () => {
      expect(tokenStore.isExpiringSoon()).toBe(true)
    })

    it('过期时间在 5 分钟内返回 true', () => {
      const exp = Math.floor(Date.now() / 1000) + 120 // 2 分钟后过期
      tokenStore.setTokens(buildJwt(exp), 'refresh')
      expect(tokenStore.isExpiringSoon()).toBe(true)
    })

    it('过期时间在 5 分钟外返回 false', () => {
      const exp = Math.floor(Date.now() / 1000) + 600 // 10 分钟后过期
      tokenStore.setTokens(buildJwt(exp), 'refresh')
      expect(tokenStore.isExpiringSoon()).toBe(false)
    })

    it('已过期的 token 返回 true', () => {
      const exp = Math.floor(Date.now() / 1000) - 100 // 100 秒前过期
      tokenStore.setTokens(buildJwt(exp), 'refresh')
      expect(tokenStore.isExpiringSoon()).toBe(true)
    })
  })
})

describe('refreshAccessToken', () => {
  beforeEach(() => {
    // 重置 Taro.request mock
    ;(Taro.request as jest.Mock).mockReset()
  })

  it('无 refreshToken 时应抛错', async () => {
    // 确保 storage 中没有 refresh token
    tokenStore.clear()

    await expect(refreshAccessToken()).rejects.toThrow('无可用的 refreshToken')
  })

  it('成功刷新后应存储新 token 并返回 accessToken', async () => {
    const oldRefresh = 'old-refresh-token'
    const newAccess = buildJwt(Math.floor(Date.now() / 1000) + 3600)
    const newRefresh = 'new-refresh-token'

    tokenStore.setTokens('old-access', oldRefresh)
    ;(Taro.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: {
        code: 0,
        data: { accessToken: newAccess, refreshToken: newRefresh },
      },
    })

    const result = await refreshAccessToken()
    expect(result).toBe(newAccess)
    expect(tokenStore.getAccessToken()).toBe(newAccess)
    expect(tokenStore.getRefreshToken()).toBe(newRefresh)
  })

  it('HTTP 非 2xx 时应抛错', async () => {
    tokenStore.setTokens('access', 'refresh')
    ;(Taro.request as jest.Mock).mockResolvedValue({
      statusCode: 401,
      data: { code: 401, message: 'refresh token expired' },
    })

    await expect(refreshAccessToken()).rejects.toThrow('刷新 Token 失败')
  })

  it('业务 code !== 0 时应抛错', async () => {
    tokenStore.setTokens('access', 'refresh')
    ;(Taro.request as jest.Mock).mockResolvedValue({
      statusCode: 200,
      data: { code: 1001, message: 'invalid refresh token' },
    })

    await expect(refreshAccessToken()).rejects.toThrow()
  })

  it('并发调用应共享同一个 Promise（去重）', async () => {
    tokenStore.setTokens('access', 'refresh')
    const newAccess = buildJwt(Math.floor(Date.now() / 1000) + 3600)

    // 模拟延迟响应
    ;(Taro.request as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                statusCode: 200,
                data: { code: 0, data: { accessToken: newAccess, refreshToken: 'new-refresh' } },
              }),
            100,
          ),
        ),
    )

    // 并发发起两次刷新
    const [p1, p2] = [refreshAccessToken(), refreshAccessToken()]

    const [r1, r2] = await Promise.all([p1, p2])

    // 两个 Promise 应返回相同结果
    expect(r1).toBe(r2)
    expect(r1).toBe(newAccess)
    // Taro.request 只应被调用一次（去重）
    expect(Taro.request).toHaveBeenCalledTimes(1)
  })
})
