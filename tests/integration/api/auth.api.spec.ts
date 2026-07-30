/**
 * 认证 API 集成测试
 *
 * 覆盖 auth-service 的核心端点：
 *  - POST /auth/wechat-login   微信登录（Mock 模式）
 *  - POST /auth/refresh-token  刷新 Token
 *  - POST /auth/logout         登出
 *  - GET  /auth/health         健康检查
 *
 * 测试维度：正向流程 + 异常输入 + Token 生命周期。
 */
import { createClient, ApiClient, ApiError } from '../helpers/test-client'
import { buildWechatLoginPayload, randomString } from '../helpers/mock-data'
import { cleanupUser } from '../helpers/db-helper'

describe('认证 API（auth-service）', () => {
  let client: ApiClient
  let userId: string

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* noop */
      })
    }
  })

  describe('GET /auth/health', () => {
    test('健康检查返回 ok', async () => {
      client = createClient('auth')
      const result = await client.get<{ status: string; service: string }>('/auth/health')
      expect(result).toMatchObject({ status: 'ok', service: 'auth-service' })
    })
  })

  describe('POST /auth/wechat-login', () => {
    test('Mock 模式登录成功，返回 token 与 user', async () => {
      client = createClient('auth')
      const payload = buildWechatLoginPayload()
      const result = await client.wechatLogin(payload.code, payload.nickname, payload.avatarUrl)

      userId = result.user.id
      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
      expect(result.user.openId).toMatch(/^mock_openid_/)
      expect(result.user.nickname).toBe(payload.nickname)
      expect(typeof result.isNewUser).toBe('boolean')
    })

    test('同一 code 重复登录返回同一用户（幂等）', async () => {
      const c = createClient('auth')
      const code = randomString('wx_code_repeat')
      const r1 = await c.wechatLogin(code)
      const r2 = await c.wechatLogin(code)

      expect(r2.user.id).toBe(r1.user.id)
      expect(r2.user.openId).toBe(r1.user.openId)
      // 第二次应为老用户
      expect(r2.isNewUser).toBe(false)

      await cleanupUser(r1.user.id).catch(() => {
        /* noop */
      })
    })

    test('空 code 应被校验拦截', async () => {
      const c = createClient('auth')
      await expect(c.post('/auth/wechat-login', { code: '' })).rejects.toThrow(ApiError)
    })
  })

  describe('POST /auth/refresh-token', () => {
    test('用 refreshToken 换取新的 token 对', async () => {
      const c = createClient('auth')
      const payload = buildWechatLoginPayload()
      const loginResult = await c.wechatLogin(payload.code, payload.nickname, payload.avatarUrl)

      // 用 refresh token 换新 token
      const refreshResult = await c.post<{ accessToken: string; refreshToken: string }>(
        '/auth/refresh-token',
        { refreshToken: loginResult.refreshToken },
        { raw: false },
      )

      expect(refreshResult.accessToken).toBeTruthy()
      expect(refreshResult.refreshToken).toBeTruthy()

      await cleanupUser(loginResult.user.id).catch(() => {
        /* noop */
      })
    })

    test('无效 refreshToken 应返回未授权', async () => {
      const c = createClient('auth')
      await expect(
        c.post('/auth/refresh-token', { refreshToken: 'invalid_token_xxx' }),
      ).rejects.toThrow(ApiError)
    })
  })

  describe('POST /auth/logout', () => {
    test('登出后将 Token 加入黑名单，后续请求应被拒绝', async () => {
      const c = createClient('auth')
      const payload = buildWechatLoginPayload()
      const loginResult = await c.wechatLogin(payload.code, payload.nickname, payload.avatarUrl)

      // 登出
      const logoutResult = await c.post<{ success: true }>('/auth/logout')
      expect(logoutResult.success).toBe(true)

      // 短暂等待 Redis 黑名单生效
      await new Promise((r) => setTimeout(r, 500))

      // 同一 token 再次访问受保护接口应被拒
      const userClient = createClient('user', {
        accessToken: loginResult.accessToken,
      })
      await expect(userClient.get('/users/me')).rejects.toThrow(ApiError)

      await cleanupUser(loginResult.user.id).catch(() => {
        /* noop */
      })
    })
  })

  describe('JWT 守卫', () => {
    test('无 Token 访问受保护接口应返回未授权', async () => {
      const c = createClient('auth')
      await expect(c.post('/auth/logout')).rejects.toThrow(ApiError)
    })

    test('无效 Token 应被拒绝', async () => {
      const c = createClient('auth', { accessToken: 'invalid.jwt.token' })
      await expect(c.post('/auth/logout')).rejects.toThrow(ApiError)
    })
  })
})
