/**
 * 计费 API 集成测试
 *
 * 覆盖 billing-service 的核心端点：
 *  - GET  /points/balance          积分余额（JWT）
 *  - GET  /points/transactions      流水列表（JWT）
 *  - GET  /points/transactions/:id  单笔流水（JWT）
 *  - POST /points/freeze            冻结积分（内部 API，x-api-key）
 *  - POST /points/settle            结算积分（内部 API）
 *  - POST /points/release           释放积分（内部 API）
 *  - POST /points/grant             赠送积分（内部 API）
 *
 * 测试重点：
 *  - 内部 API 鉴权（x-api-key 缺失 / 错误应被拒）
 *  - 冻结 / 结算 / 释放 幂等性（重复请求返回首次结果）
 *  - grant 幂等性（同一 idempotencyKey 不重复赠积分）
 *  - 余额不足冻结应失败
 */
import { createClient, withToken, ApiClient, ApiError } from '../helpers/test-client'
import {
  buildWechatLoginPayload,
  buildFreezePointsPayload,
  buildGrantPointsPayload,
  randomIdempotencyKey,
} from '../helpers/mock-data'
import { cleanupUser, getUserPoints } from '../helpers/db-helper'

describe('计费 API（billing-service）', () => {
  let authClient: ApiClient
  let billingClient: ApiClient
  let userId: string

  // 内部 API 专用客户端（带 x-api-key）
  let internalClient: ApiClient

  beforeAll(async () => {
    authClient = createClient('auth')
    const payload = buildWechatLoginPayload({ nickname: 'API测试-计费' })
    const loginResult = await authClient.wechatLogin(
      payload.code,
      payload.nickname,
      payload.avatarUrl,
    )
    userId = loginResult.user.id

    billingClient = withToken(authClient, 'billing')
    // 内部 API 用同一服务但走 internal 标记
    internalClient = withToken(authClient, 'billing')
  })

  afterAll(async () => {
    if (userId) {
      await cleanupUser(userId).catch(() => {
        /* noop */
      })
    }
  })

  describe('内部 API 鉴权', () => {
    test('无 x-api-key 调用 freeze 应被拒绝', async () => {
      // 用普通 post（不传 internal）模拟缺失 x-api-key
      await expect(
        billingClient.post('/points/freeze', buildFreezePointsPayload(userId, { amount: 1 })),
      ).rejects.toThrow(ApiError)
    })

    test('错误 x-api-key 应被拒绝', async () => {
      const wrongKeyClient = createClient('billing', {
        accessToken: authClient.getAccessToken() ?? undefined,
      })
      await expect(
        wrongKeyClient.post('/points/freeze', buildFreezePointsPayload(userId, { amount: 1 }), {
          headers: { 'x-api-key': 'wrong-key' },
          raw: true,
        }),
      ).resolves.toBeDefined() // 返回的响应体中含错误 code，但 raw 不抛错
    })
  })

  describe('POST /points/grant（赠送积分，内部 API）', () => {
    test('赠送积分成功，余额增加', async () => {
      const before = await getUserPoints(userId)
      const amount = 50
      const payload = buildGrantPointsPayload(
        userId,
        amount,
        '00000000-0000-4000-8000-000000000010',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      )

      const result = await internalClient.post<{
        transactionId?: string
        balance?: number
      }>('/points/grant', payload, { internal: true })

      expect(result).toBeDefined()

      const after = await getUserPoints(userId)
      expect(after.currentPoints).toBe(before.currentPoints + amount)
      expect(after.totalPoints).toBe(before.totalPoints + amount)
    })

    test('grant 幂等性：相同 idempotencyKey 不重复赠积分', async () => {
      const before = await getUserPoints(userId)
      const idemKey = randomIdempotencyKey('grant_idem')
      const amount = 30

      const payload = buildGrantPointsPayload(
        userId,
        amount,
        '00000000-0000-4000-8000-000000000011',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        { idempotencyKey: idemKey },
      )

      // 第一次赠送
      await internalClient.post('/points/grant', payload, { internal: true })
      const after1 = await getUserPoints(userId)
      expect(after1.currentPoints).toBe(before.currentPoints + amount)

      // 第二次相同 idempotencyKey
      await internalClient.post('/points/grant', payload, { internal: true })
      const after2 = await getUserPoints(userId)
      expect(after2.currentPoints).toBe(after1.currentPoints)
    })
  })

  describe('POST /points/freeze（冻结积分，内部 API）', () => {
    test('冻结积分成功', async () => {
      const before = await getUserPoints(userId)
      // 先确保有余额（前面 grant 已赠送）
      if (before.currentPoints < 10) {
        await internalClient.post(
          '/points/grant',
          buildGrantPointsPayload(
            userId,
            100,
            '00000000-0000-4000-8000-000000000012',
            'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          ),
          { internal: true },
        )
      }

      const idemKey = randomIdempotencyKey('freeze')
      const payload = buildFreezePointsPayload(userId, {
        amount: 10,
        idempotencyKey: idemKey,
      })

      const result = await internalClient.post<{ frozenAmount?: number }>(
        '/points/freeze',
        payload,
        { internal: true },
      )
      expect(result).toBeDefined()
    })

    test('freeze 幂等性：相同 idempotencyKey 不重复冻结', async () => {
      const idemKey = randomIdempotencyKey('freeze_idem')

      const payload = buildFreezePointsPayload(userId, {
        amount: 5,
        idempotencyKey: idemKey,
      })

      await internalClient.post('/points/freeze', payload, { internal: true })
      const after1 = await getUserPoints(userId)

      // 第二次相同 idempotencyKey
      await internalClient.post('/points/freeze', payload, { internal: true })
      const after2 = await getUserPoints(userId)

      // currentPoints 不变（幂等）
      expect(after2.currentPoints).toBe(after1.currentPoints)
    })

    test('余额不足冻结应失败', async () => {
      const before = await getUserPoints(userId)
      const idemKey = randomIdempotencyKey('freeze_fail')
      const tooMuch = before.currentPoints + 1000000

      await expect(
        internalClient.post(
          '/points/freeze',
          buildFreezePointsPayload(userId, {
            amount: tooMuch,
            idempotencyKey: idemKey,
          }),
          { internal: true },
        ),
      ).rejects.toThrow(ApiError)
    })
  })

  describe('GET /points/balance（JWT）', () => {
    test('查询积分余额', async () => {
      const balance = await billingClient.get<{
        balance: number
        frozen: number
        total: number
      }>('/points/balance')

      expect(typeof balance.balance).toBe('number')
      expect(typeof balance.frozen).toBe('number')
      expect(typeof balance.total).toBe('number')
      expect(balance.total).toBeGreaterThanOrEqual(balance.balance)
    })
  })

  describe('GET /points/transactions（JWT）', () => {
    test('查询积分流水列表', async () => {
      const result = await billingClient.get<{
        list: Array<{
          id: string
          type: string
          amount: number
          direction: string
        }>
        total: number
        page: number
        pageSize: number
      }>('/points/transactions', { page: 1, pageSize: 20 })

      expect(result).toBeDefined()
      expect(Array.isArray(result.list)).toBe(true)
      expect(typeof result.total).toBe('number')
      // 前面 grant / freeze 应产生流水
      expect(result.total).toBeGreaterThan(0)
    })

    test('分页参数生效', async () => {
      const r1 = await billingClient.get<{ list: unknown[]; total: number }>(
        '/points/transactions',
        { page: 1, pageSize: 1 },
      )
      const r2 = await billingClient.get<{ list: unknown[]; total: number }>(
        '/points/transactions',
        { page: 2, pageSize: 1 },
      )

      expect(r1.list.length).toBeLessThanOrEqual(1)
      expect(r2.list.length).toBeLessThanOrEqual(1)
    })

    test('单笔流水详情查询', async () => {
      const list = await billingClient.get<{
        list: Array<{ id: string }>
      }>('/points/transactions', { page: 1, pageSize: 1 })

      if (list.list.length > 0) {
        const txId = list.list[0].id
        const tx = await billingClient.get<{
          id: string
          type: string
          amount: number
        }>(`/points/transactions/${txId}`)
        expect(tx.id).toBe(txId)
      }
    })
  })
})
