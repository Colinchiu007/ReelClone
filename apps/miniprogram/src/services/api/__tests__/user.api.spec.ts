/**
 * @jest-environment jsdom
 *
 * User API 单元测试
 *
 * 覆盖 user.api.ts 中所有 6 个函数：
 *  - getCurrentUser   GET  /users/me
 *  - updateUser       PUT  /users/me
 *  - bindMobile       POST /users/bind-mobile
 *  - changePassword   PUT  /users/password
 *  - sendSms          POST /sms/send
 *  - getUserProfile   GET  /users/:id/profile
 *
 * 每个 describe 块按函数名分组，覆盖：
 *  - 正常路径（URL + HTTP 方法 + 返回值透传）
 *  - 参数传递（body 包装正确）
 *  - URL 拼接（含路径参数时拼接正确）
 *  - 无参数调用（可选参数为空时正确调用）
 */

import type { User, UserProfile } from '@/types'

/** mock request 模块 —— 屏蔽 RequestManager 真实实现，仅断言调用参数与返回值透传 */
jest.mock('../../request', () => ({
  request: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

import { request } from '../../request'
import * as userApi from '../user.api'

// -------------------- 工厂函数 --------------------

/** 构造一个 User 对象 */
function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    openId: 'wx-open-id-001',
    nickname: '测试用户',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    mobile: '13800000000',
    email: 'test@example.com',
    currentPoints: 1000,
    totalPoints: 5000,
    industryPreferences: ['好物种草', '本地生活'],
    status: 'ACTIVE',
    createdAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  }
}

/** 构造一个 UserProfile 对象 */
function buildUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'user-001',
    nickname: '测试作者',
    avatarUrl: 'https://cdn.example.com/avatar.png',
    templateUploadCount: 12,
    templateUsedCount: 348,
    ...overrides,
  }
}

// -------------------- mock 句柄 --------------------

const mockGet = request.get as jest.Mock
const mockPost = request.post as jest.Mock
const mockPut = request.put as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// -------------------- 测试用例 --------------------

describe('userApi', () => {
  describe('getCurrentUser', () => {
    it('正常路径：应请求 GET /users/me 并透传 User 返回值', async () => {
      const user = buildUser()
      mockGet.mockResolvedValue(user)

      const result = await userApi.getCurrentUser()

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/users/me')
      expect(result).toBe(user)
    })

    it('返回值应等于 request.get 的返回值（透传）', async () => {
      const user = buildUser({ id: 'user-002', nickname: '另一个用户' })
      mockGet.mockResolvedValue(user)

      const result = await userApi.getCurrentUser()

      expect(result).toEqual(user)
      expect(result.nickname).toBe('另一个用户')
    })
  })

  describe('updateUser', () => {
    it('正常路径：应请求 PUT /users/me 并透传 data', async () => {
      const data = { nickname: '新昵称', avatarUrl: 'https://cdn.example.com/new.png' }
      const updated = buildUser(data)
      mockPut.mockResolvedValue(updated)

      const result = await userApi.updateUser(data)

      expect(mockPut).toHaveBeenCalledTimes(1)
      expect(mockPut).toHaveBeenCalledWith('/users/me', data)
      expect(result).toBe(updated)
    })

    it('仅更新 industryPreferences 时应正确传递部分字段', async () => {
      const data = { industryPreferences: ['教育', '电商'] }
      mockPut.mockResolvedValue(buildUser(data))

      await userApi.updateUser(data)

      expect(mockPut).toHaveBeenCalledWith('/users/me', {
        industryPreferences: ['教育', '电商'],
      })
    })

    it('仅更新 email 时应正确传递单字段', async () => {
      const data = { email: 'new@example.com' }
      mockPut.mockResolvedValue(buildUser(data))

      await userApi.updateUser(data)

      expect(mockPut).toHaveBeenCalledWith('/users/me', { email: 'new@example.com' })
    })
  })

  describe('bindMobile', () => {
    it('正常路径：应请求 POST /users/bind-mobile 且 body 为 { mobile, code }', async () => {
      const user = buildUser({ mobile: '13900000000' })
      mockPost.mockResolvedValue(user)

      const result = await userApi.bindMobile('13900000000', '1234')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/users/bind-mobile', {
        mobile: '13900000000',
        code: '1234',
      })
      expect(result).toBe(user)
    })

    it('不同手机号与验证码时 body 应正确拼接', async () => {
      mockPost.mockResolvedValue(buildUser())

      await userApi.bindMobile('13700000000', '9999')

      expect(mockPost).toHaveBeenCalledWith('/users/bind-mobile', {
        mobile: '13700000000',
        code: '9999',
      })
    })
  })

  describe('changePassword', () => {
    it('正常路径：应请求 PUT /users/password 并透传完整 data', async () => {
      const data = { oldPassword: 'Old@1234', newPassword: 'New@1234' }
      mockPut.mockResolvedValue(undefined)

      const result = await userApi.changePassword(data)

      expect(mockPut).toHaveBeenCalledTimes(1)
      expect(mockPut).toHaveBeenCalledWith('/users/password', data)
      expect(result).toBeUndefined()
    })

    it('未设置密码场景（仅 newPassword + code）应正确传递', async () => {
      const data = { newPassword: 'New@1234', code: '1234' }
      mockPut.mockResolvedValue(undefined)

      await userApi.changePassword(data)

      expect(mockPut).toHaveBeenCalledWith('/users/password', {
        newPassword: 'New@1234',
        code: '1234',
      })
    })
  })

  describe('sendSms', () => {
    it('正常路径：应请求 POST /sms/send 且 body 为 { mobile, purpose }', async () => {
      mockPost.mockResolvedValue(undefined)

      const result = await userApi.sendSms('13800000000', 'bind-mobile')

      expect(mockPost).toHaveBeenCalledTimes(1)
      expect(mockPost).toHaveBeenCalledWith('/sms/send', {
        mobile: '13800000000',
        purpose: 'bind-mobile',
      })
      expect(result).toBeUndefined()
    })

    it('不同 purpose 时 body 应正确拼接', async () => {
      mockPost.mockResolvedValue(undefined)

      await userApi.sendSms('13900000000', 'change-password')

      expect(mockPost).toHaveBeenCalledWith('/sms/send', {
        mobile: '13900000000',
        purpose: 'change-password',
      })
    })
  })

  describe('getUserProfile', () => {
    it('正常路径：应请求 GET /users/:id/profile URL 拼接正确并返回 UserProfile', async () => {
      const profile = buildUserProfile({ userId: 'user-001' })
      mockGet.mockResolvedValue(profile)

      const result = await userApi.getUserProfile('user-001')

      expect(mockGet).toHaveBeenCalledTimes(1)
      expect(mockGet).toHaveBeenCalledWith('/users/user-001/profile')
      expect(result).toBe(profile)
    })

    it('不同 userId 时 URL 拼接正确', async () => {
      mockGet.mockResolvedValue(buildUserProfile({ userId: 'user-abc-789' }))

      await userApi.getUserProfile('user-abc-789')

      expect(mockGet).toHaveBeenCalledWith('/users/user-abc-789/profile')
    })
  })
})
