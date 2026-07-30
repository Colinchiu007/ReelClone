/**
 * 用户 API 集成测试
 *
 * 覆盖 user-service 的核心端点：
 *  - GET  /users/me           获取当前用户
 *  - PUT  /users/me           更新用户信息
 *  - POST /users/bind-mobile  绑定手机号
 *  - PUT  /users/password     修改密码
 *  - POST /sms/send           发送短信验证码（Mock 模式）
 *
 * 测试维度：正向流程 + 异常输入 + 跨服务数据一致性。
 */
import { createClient, withToken, ApiClient, ApiError } from '../helpers/test-client'
import { buildWechatLoginPayload, randomMobile, randomString } from '../helpers/mock-data'
import { cleanupUser } from '../helpers/db-helper'
import { SmsCodePurpose } from '@reelclone/database'

describe('用户 API（user-service）', () => {
  let authClient: ApiClient
  let userClient: ApiClient
  let userId: string
  let mobile: string

  beforeAll(async () => {
    authClient = createClient('auth')
    const payload = buildWechatLoginPayload({ nickname: 'API测试-用户' })
    const loginResult = await authClient.wechatLogin(
      payload.code,
      payload.nickname,
      payload.avatarUrl,
    )
    userId = loginResult.user.id
    userClient = withToken(authClient, 'user')
  })

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* noop */
      })
    }
  })

  describe('GET /users/me', () => {
    test('获取当前登录用户信息', async () => {
      const me = await userClient.get<{
        id: string
        openId: string
        nickname: string
        currentPoints: number
      }>('/users/me')

      expect(me.id).toBe(userId)
      expect(me.openId).toBeTruthy()
      expect(me.nickname).toBeTruthy()
    })

    test('未授权访问应被拒绝', async () => {
      const anon = createClient('user')
      await expect(anon.get('/users/me')).rejects.toThrow(ApiError)
    })
  })

  describe('PUT /users/me', () => {
    test('更新昵称与头像', async () => {
      const newNickname = `更新昵称_${Date.now()}`
      const updated = await userClient.put<{
        id: string
        nickname: string
        avatarUrl: string | null
      }>('/users/me', {
        nickname: newNickname,
        avatarUrl: 'https://example.com/new-avatar.png',
      })

      expect(updated.nickname).toBe(newNickname)

      // 再次查询确认持久化
      const me = await userClient.get<{ nickname: string }>('/users/me')
      expect(me.nickname).toBe(newNickname)
    })

    test('超长昵称应被校验拦截（MaxLength 64）', async () => {
      await expect(userClient.put('/users/me', { nickname: 'x'.repeat(65) })).rejects.toThrow(
        ApiError,
      )
    })
  })

  describe('POST /sms/send（Mock 模式）', () => {
    test('发送短信验证码', async () => {
      mobile = randomMobile()
      // Mock 模式下应直接返回成功（不实际发送）
      await expect(
        userClient.post('/sms/send', { mobile, purpose: SmsCodePurpose.BIND_MOBILE }),
      ).resolves.toBeDefined()
    })

    test('无效手机号应被校验拦截', async () => {
      await expect(
        userClient.post('/sms/send', { mobile: '123', purpose: SmsCodePurpose.BIND_MOBILE }),
      ).rejects.toThrow(ApiError)
    })
  })

  describe('POST /users/bind-mobile', () => {
    test('绑定手机号（Mock 模式验证码任意）', async () => {
      mobile = randomMobile()
      // 先发送验证码
      await userClient.post('/sms/send', { mobile, purpose: SmsCodePurpose.BIND_MOBILE })

      const result = await userClient.post<{
        id: string
        mobile: string
      }>('/users/bind-mobile', { mobile, code: '123456' })

      expect(result.mobile).toBe(mobile)

      // 再次查询确认手机号已绑定
      const me = await userClient.get<{ mobile: string | null }>('/users/me')
      expect(me.mobile).toBe(mobile)
    })

    test('重复绑定同一手机号应幂等或返回已绑定', async () => {
      // 已绑定的手机号再次绑定，应成功或返回业务异常（取决于实现）
      try {
        const result = await userClient.post('/users/bind-mobile', {
          mobile,
          code: '123456',
        })
        expect(result).toBeDefined()
      } catch (err) {
        // 业务异常（已绑定）也视为符合预期
        expect(err).toBeInstanceOf(ApiError)
      }
    })
  })

  describe('行业偏好', () => {
    test('更新行业偏好', async () => {
      const industries = ['ecommerce', 'education']
      const result = await userClient.put<{
        industryPreferences?: string[]
      }>('/users/me', { industryPreferences: industries })

      expect(result).toBeDefined()

      const me = await userClient.get<{ industryPreferences?: string[] }>('/users/me')
      expect(me.industryPreferences).toEqual(industries)
    })
  })

  describe('PUT /users/password', () => {
    test('设置密码（首次，无需旧密码，用短信验证码验证）', async () => {
      // Mock 模式下短信验证码任意
      const newPassword = `Pwd_${randomString('pw')}1`
      // 使用新手机号避免与 bind-mobile 测试的 60s 限流冲突
      const pwdMobile = randomMobile()
      // 微信登录用户首次设密码，需先发送 RESET_PASSWORD 验证码
      await userClient.post('/sms/send', {
        mobile: pwdMobile,
        purpose: SmsCodePurpose.RESET_PASSWORD,
      })
      await userClient.put('/users/password', {
        newPassword,
        mobile: pwdMobile,
        code: '123456',
      })

      // 验证：用新密码无法直接登录（微信登录无密码），但接口应成功
      // 此处仅校验接口不抛错
    })

    test('新密码过短应被校验拦截', async () => {
      await expect(
        userClient.put('/users/password', { newPassword: '123', code: '123456' }),
      ).rejects.toThrow(ApiError)
    })
  })
})
