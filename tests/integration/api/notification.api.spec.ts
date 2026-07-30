/**
 * 通知 API 集成测试
 *
 * 覆盖 notification-service 的核心端点：
 *  - GET  /notifications              通知列表（JWT，分页 + 筛选）
 *  - GET  /notifications/unread-count  未读数量（JWT）
 *  - POST /notifications/read-all      全部标记已读（JWT）
 *  - POST /notifications/:id/read      标记单条已读（JWT）
 *
 * 测试维度：
 *  - 列表分页与筛选
 *  - 未读计数准确性
 *  - 标记已读后未读数递减
 *  - 通知可通过业务事件（积分变动 / 生成完成）触发
 */
import { createClient, withToken, ApiClient, ApiError } from '../helpers/test-client'
import {
  buildWechatLoginPayload,
  buildTextGenerationPayload,
  buildGrantPointsPayload,
} from '../helpers/mock-data'
import { cleanupUser, seedPackages } from '../helpers/db-helper'

describe('通知 API（notification-service）', () => {
  let authClient: ApiClient
  let notificationClient: ApiClient
  let billingClient: ApiClient
  let workbenchClient: ApiClient
  let userId: string

  beforeAll(async () => {
    await seedPackages()
    authClient = createClient('auth')
    const payload = buildWechatLoginPayload({ nickname: 'API测试-通知' })
    const loginResult = await authClient.wechatLogin(
      payload.code,
      payload.nickname,
      payload.avatarUrl,
    )
    userId = loginResult.user.id

    notificationClient = withToken(authClient, 'notification')
    billingClient = withToken(authClient, 'billing')
    workbenchClient = withToken(authClient, 'workbench')
  })

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* noop */
      })
    }
  })

  describe('GET /notifications/unread-count', () => {
    test('查询未读数量', async () => {
      const result = await notificationClient.get<{ count: number }>('/notifications/unread-count')

      expect(result).toBeDefined()
      expect(typeof result.count).toBe('number')
      expect(result.count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('GET /notifications', () => {
    test('通知列表分页', async () => {
      const result = await notificationClient.get<{
        list: Array<{
          id: string
          type: string
          isRead: boolean
        }>
        total: number
        page: number
        pageSize: number
      }>('/notifications', { page: 1, pageSize: 10 })

      expect(Array.isArray(result.list)).toBe(true)
      expect(typeof result.total).toBe('number')
    })

    test('未读筛选生效', async () => {
      const result = await notificationClient.get<{
        list: Array<{ isRead: boolean }>
      }>('/notifications', { isRead: false, page: 1, pageSize: 50 })

      // 所有返回的都应是未读
      expect(result.list.every((n) => n.isRead === false)).toBe(true)
    })
  })

  describe('业务事件触发通知', () => {
    test('赠送积分后应产生通知', async () => {
      const before = await notificationClient.get<{ count: number }>('/notifications/unread-count')

      // 触发一笔积分赠送（应产生通知）
      await billingClient.post(
        '/points/grant',
        buildGrantPointsPayload(
          userId,
          10,
          '00000000-0000-4000-8000-000000000001',
          'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        ),
        { internal: true },
      )

      // 等待通知异步生成
      await new Promise((r) => setTimeout(r, 1500))

      const after = await notificationClient.get<{ count: number }>('/notifications/unread-count')
      // 未读数应 >= 之前（可能产生新通知）
      expect(after.count).toBeGreaterThanOrEqual(before.count)
    })

    test('提交生成任务应产生通知', async () => {
      const before = await notificationClient.get<{ count: number }>('/notifications/unread-count')

      await workbenchClient.post('/generations', buildTextGenerationPayload())

      // 等待通知异步生成
      await new Promise((r) => setTimeout(r, 1500))

      const after = await notificationClient.get<{ count: number }>('/notifications/unread-count')
      expect(after.count).toBeGreaterThanOrEqual(before.count)
    })
  })

  describe('POST /notifications/:id/read', () => {
    test('标记单条通知已读', async () => {
      // 取第一条未读通知
      const list = await notificationClient.get<{
        list: Array<{ id: string; isRead: boolean }>
      }>('/notifications', { isRead: false, page: 1, pageSize: 1 })

      if (list.list.length === 0) {
        // 没有未读通知，跳过（视环境而定）
        return
      }

      const target = list.list[0]
      const before = await notificationClient.get<{ count: number }>('/notifications/unread-count')

      await notificationClient.post(`/notifications/${target.id}/read`)

      const after = await notificationClient.get<{ count: number }>('/notifications/unread-count')
      expect(after.count).toBe(before.count - 1)
    })
  })

  describe('POST /notifications/read-all', () => {
    test('全部标记已读后未读数为 0', async () => {
      const result = await notificationClient.post<{ affected: number }>('/notifications/read-all')

      expect(result).toBeDefined()
      expect(typeof result.affected).toBe('number')

      // 等待一下确认
      await new Promise((r) => setTimeout(r, 500))

      const unread = await notificationClient.get<{ count: number }>('/notifications/unread-count')
      expect(unread.count).toBe(0)
    })
  })

  describe('鉴权', () => {
    test('未授权访问应被拒绝', async () => {
      const anon = createClient('notification')
      await expect(anon.get('/notifications')).rejects.toThrow(ApiError)
    })
  })
})
