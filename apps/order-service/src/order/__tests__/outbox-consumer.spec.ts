/**
 * OutboxConsumer 单元测试 — Task B5.4
 *
 * 覆盖：
 *  - computeBackoffMs：指数退避 + 上限
 *  - claimBatch：lease 机制 SQL（FOR UPDATE SKIP LOCKED + lease_expires_at 过滤）
 *  - deliverOne：billing 成功 → DELIVERED + CONFIRMED
 *  - deliverOne：billing 失败 → attempts++ / 指数退避 / lastError
 *  - deliverOne：超过 MAX_ATTEMPTS → DEAD + operation DEAD + 告警
 *  - deliverOne：eventPayload 缺失必要字段 → 直接 DEAD
 *  - processOnce：running 标志防并发（同实例不重入）
 *  - lease 机制：lease_expires_at 未过期记录不会被重新 claim（SQL 语义验证）
 *  - lease 机制：多实例 ownerToken 不同，claimBatch 写入各自 owner（互不干扰）
 */
import {
  CreditOperation,
  CreditOperationOutbox,
  CreditOperationStatus,
  OutboxStatus,
} from '@reelclone/database'
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { BillingClient } from '../billing.client'
import { OutboxConsumer, computeBackoffMs } from '../outbox.consumer'

// -------------------- Mock 工具 --------------------

/** 构造一条 outbox 记录 */
function createOutbox(overrides: Partial<CreditOperationOutbox> = {}): CreditOperationOutbox {
  return {
    id: 'outbox-001',
    operationId: 'order-grant:order-001',
    creditOperationId: 'op-001',
    status: OutboxStatus.PENDING,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    eventPayload: {
      type: 'GRANT',
      relatedOrderId: 'order-001',
      userId: 'user-001',
      packageId: 'pkg-001',
      amount: 120,
      idempotencyKey: 'order:order-001:grant',
      orderNo: 'RC20250101000000123456',
    },
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  } as CreditOperationOutbox
}

/** 模拟 Repository（仅 update 路径用） */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<T>>
}

/**
 * 构造 OutboxConsumer 实例，注入 mock DataSource + BillingClient。
 * 默认 query 返回空数组（无 PENDING），getRepository 返回 mock repo。
 */
function createConsumer(
  overrides: {
    query?: jest.Mock
    outboxRepo?: jest.Mocked<Repository<CreditOperationOutbox>>
    operationRepo?: jest.Mocked<Repository<CreditOperation>>
    billingClient?: jest.Mocked<BillingClient>
  } = {},
): {
  consumer: OutboxConsumer
  query: jest.Mock
  outboxRepo: jest.Mocked<Repository<CreditOperationOutbox>>
  operationRepo: jest.Mocked<Repository<CreditOperation>>
  billingClient: jest.Mocked<BillingClient>
} {
  const query = overrides.query ?? jest.fn().mockResolvedValue([])
  const outboxRepo = overrides.outboxRepo ?? mockRepo<CreditOperationOutbox>()
  const operationRepo = overrides.operationRepo ?? mockRepo<CreditOperation>()
  const billingClient =
    overrides.billingClient ??
    ({
      grant: jest.fn().mockResolvedValue({ balance: 120, success: true }),
    } as unknown as jest.Mocked<BillingClient>)

  const mainDataSource = {
    query,
    getRepository: jest.fn((target: unknown) => {
      if (target === CreditOperationOutbox) return outboxRepo
      if (target === CreditOperation) return operationRepo
      return mockRepo()
    }),
  } as unknown as jest.Mocked<DataSource>

  const consumer = new OutboxConsumer(mainDataSource, billingClient)
  return { consumer, query, outboxRepo, operationRepo, billingClient }
}

// -------------------- 测试 --------------------

describe('OutboxConsumer (Task B5.4)', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- computeBackoffMs --------------------

  describe('computeBackoffMs', () => {
    it('指数退避：attempts=1 → 10s，attempts=2 → 20s，attempts=3 → 40s', () => {
      expect(computeBackoffMs(1)).toBe(10_000)
      expect(computeBackoffMs(2)).toBe(20_000)
      expect(computeBackoffMs(3)).toBe(40_000)
    })

    it('退避上限为 1 小时（3_600_000ms）', () => {
      // 5000 * 2^10 = 5_120_000 > 3_600_000 → 截断为 3_600_000
      expect(computeBackoffMs(10)).toBe(3_600_000)
      expect(computeBackoffMs(20)).toBe(3_600_000)
    })
  })

  // -------------------- claimBatch：lease 机制 --------------------

  describe('claimBatch — lease 机制防并发', () => {
    it('claim SQL 包含 FOR UPDATE SKIP LOCKED 与 lease_expires_at 过滤', async () => {
      const { consumer, query } = createConsumer({
        query: jest.fn().mockResolvedValue([]),
      })

      await consumer.claimBatch(50)

      expect(query).toHaveBeenCalledTimes(1)
      const [sql, params] = query.mock.calls[0]
      // 关键并发安全子句必须在 SQL 中
      expect(sql).toContain('FOR UPDATE SKIP LOCKED')
      expect(sql).toContain("status = 'PENDING'")
      expect(sql).toContain('lease_expires_at IS NULL OR lease_expires_at <= NOW()')
      expect(sql).toContain('next_attempt_at IS NULL OR next_attempt_at <= NOW()')
      // 参数：[ownerToken, leaseExpiresAt, limit]
      expect(params).toHaveLength(3)
      expect(params[2]).toBe(50)
      // leaseExpiresAt 是 Date 实例，且在未来 30s 内
      const leaseExpiresAt = params[1] as Date
      expect(leaseExpiresAt).toBeInstanceOf(Date)
      const delta = leaseExpiresAt.getTime() - Date.now()
      expect(delta).toBeGreaterThan(20_000)
      expect(delta).toBeLessThanOrEqual(30_000)
      // ownerToken 是 uuid 字符串
      expect(typeof params[0]).toBe('string')
      expect(params[0]).toMatch(/^[0-9a-f-]{36}$/i)
    })

    it('lease 未过期记录不会被重新 claim（SQL where 子句保证）', async () => {
      // 通过验证 SQL 文本中的 lease_expires_at <= NOW() 子句，
      // 确认 lease 未过期（lease_expires_at > NOW()）的记录会被过滤掉。
      const { consumer, query } = createConsumer({
        query: jest.fn().mockResolvedValue([]),
      })

      await consumer.claimBatch(10)

      const sql = query.mock.calls[0][0] as string
      // 该子句保证：被某实例 claim 且 lease 未过期的记录，不会被另一个实例再 claim
      expect(sql).toMatch(/lease_expires_at\s+IS\s+NULL\s+OR\s+lease_expires_at\s*<=\s*NOW\(\)/i)
    })

    it('多实例 ownerToken 不同：claimBatch 写入各自 owner，互不干扰', async () => {
      const consumerA = createConsumer({ query: jest.fn().mockResolvedValue([]) })
      const consumerB = createConsumer({ query: jest.fn().mockResolvedValue([]) })

      await consumerA.consumer.claimBatch(50)
      await consumerB.consumer.claimBatch(50)

      const ownerA = consumerA.query.mock.calls[0][1][0] as string
      const ownerB = consumerB.query.mock.calls[0][1][0] as string
      // 两个实例的 ownerToken 必须不同
      expect(ownerA).not.toBe(ownerB)
    })

    it('claim 返回的记录由 SQL UPDATE...RETURNING 投影', async () => {
      const claimed = [createOutbox({ id: 'outbox-a' })]
      const { consumer, query } = createConsumer({
        query: jest.fn().mockResolvedValue(claimed),
      })

      const result = await consumer.claimBatch(50)

      const sql = query.mock.calls[0][0] as string
      expect(sql).toMatch(/UPDATE\s+credit_operation_outbox\s+SET\s+lease_owner/i)
      expect(sql).toMatch(/RETURNING\s+\*/i)
      expect(result).toBe(claimed)
    })
  })

  // -------------------- deliverOne：成功路径 --------------------

  describe('deliverOne — billing 成功 → DELIVERED + CONFIRMED', () => {
    it('调用 billing grant 并标记 outbox DELIVERED + operation CONFIRMED', async () => {
      const { consumer, outboxRepo, operationRepo, billingClient } = createConsumer()
      const outbox = createOutbox()

      await consumer.deliverOne(outbox)

      // billing grant 调用参数来自 eventPayload
      expect(billingClient.grant).toHaveBeenCalledWith({
        userId: 'user-001',
        amount: 120,
        idempotencyKey: 'order:order-001:grant',
        orderId: 'order-001',
        packageId: 'pkg-001',
      })

      // outbox 标记 DELIVERED + 释放租约
      expect(outboxRepo.update).toHaveBeenCalledWith(
        { id: 'outbox-001' },
        {
          status: OutboxStatus.DELIVERED,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )

      // operation 标记 CONFIRMED
      expect(operationRepo.update).toHaveBeenCalledWith(
        { id: 'op-001' },
        { status: CreditOperationStatus.CONFIRMED },
      )
    })
  })

  // -------------------- deliverOne：失败 + 重试退避 --------------------

  describe('deliverOne — billing 失败 → attempts++ + 指数退避', () => {
    it('第 1 次失败：attempts=1、nextAttemptAt=now+10s、lastError 记录', async () => {
      const { consumer, outboxRepo, operationRepo, billingClient } = createConsumer({
        billingClient: { grant: jest.fn().mockRejectedValue(new Error('billing down')) } as never,
      })
      const outbox = createOutbox({ attempts: 0 })
      const before = Date.now()

      await consumer.deliverOne(outbox)

      expect(billingClient.grant).toHaveBeenCalled()
      // 失败路径不调用 operation update（仅 DEAD 才更新 operation）
      expect(operationRepo.update).not.toHaveBeenCalled()

      expect(outboxRepo.update).toHaveBeenCalledTimes(1)
      const [where, patch] = outboxRepo.update.mock.calls[0]
      expect(where).toEqual({ id: 'outbox-001' })
      expect(patch.attempts).toBe(1)
      expect(patch.lastError).toBe('billing down')
      expect(patch.leaseOwner).toBeNull()
      expect(patch.leaseExpiresAt).toBeNull()
      // nextAttemptAt ≈ now + 10s（允许 1s 抖动）
      const nextAttemptAt = patch.nextAttemptAt as Date
      const delta = nextAttemptAt.getTime() - before
      expect(delta).toBeGreaterThanOrEqual(9_000)
      expect(delta).toBeLessThanOrEqual(12_000)
    })

    it('第 5 次失败：attempts=5、nextAttemptAt=now+160s（5000 * 2^5）', async () => {
      const { consumer, outboxRepo } = createConsumer({
        billingClient: { grant: jest.fn().mockRejectedValue(new Error('still down')) } as never,
      })
      const outbox = createOutbox({ attempts: 4 })
      const before = Date.now()

      await consumer.deliverOne(outbox)

      const patch = outboxRepo.update.mock.calls[0][1]
      expect(patch.attempts).toBe(5)
      const nextAttemptAt = patch.nextAttemptAt as Date
      const delta = nextAttemptAt.getTime() - before
      // 5000 * 2^5 = 160_000ms = 160s
      expect(delta).toBeGreaterThanOrEqual(159_000)
      expect(delta).toBeLessThanOrEqual(162_000)
    })
  })

  // -------------------- deliverOne：超过 MAX_ATTEMPTS → DEAD --------------------

  describe('deliverOne — 超过 MAX_ATTEMPTS(10) → DEAD + operation DEAD', () => {
    it('attempts=9 失败（nextAttempts=10）→ 标记 DEAD + operation DEAD', async () => {
      const { consumer, outboxRepo, operationRepo } = createConsumer({
        billingClient: {
          grant: jest.fn().mockRejectedValue(new Error('persistent fail')),
        } as never,
      })
      const outbox = createOutbox({ attempts: 9 })

      await consumer.deliverOne(outbox)

      // outbox 标记 DEAD + attempts++ + lastError + 释放租约
      expect(outboxRepo.update).toHaveBeenCalledWith(
        { id: 'outbox-001' },
        {
          status: OutboxStatus.DEAD,
          attempts: 10,
          lastError: 'persistent fail',
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      )
      // operation 标记 DEAD
      expect(operationRepo.update).toHaveBeenCalledWith(
        { id: 'op-001' },
        { status: CreditOperationStatus.DEAD },
      )
    })

    it('attempts=15 失败 → 仍标记 DEAD（不会无限增长）', async () => {
      const { consumer, outboxRepo } = createConsumer({
        billingClient: { grant: jest.fn().mockRejectedValue(new Error('dead')) } as never,
      })
      const outbox = createOutbox({ attempts: 15 })

      await consumer.deliverOne(outbox)

      const patch = outboxRepo.update.mock.calls[0][1]
      expect(patch.status).toBe(OutboxStatus.DEAD)
      expect(patch.attempts).toBe(16)
    })
  })

  // -------------------- deliverOne：异常 payload --------------------

  describe('deliverOne — eventPayload 缺失必要字段 → 直接 DEAD', () => {
    it('缺少 userId → 直接 DEAD，不调用 billing', async () => {
      const { consumer, outboxRepo, operationRepo, billingClient } = createConsumer()
      const outbox = createOutbox({
        eventPayload: {
          type: 'GRANT',
          relatedOrderId: 'order-001',
          // userId 缺失
          packageId: 'pkg-001',
          amount: 120,
          idempotencyKey: 'order:order-001:grant',
        } as never,
      })

      await consumer.deliverOne(outbox)

      expect(billingClient.grant).not.toHaveBeenCalled()
      expect(outboxRepo.update).toHaveBeenCalledWith(
        { id: 'outbox-001' },
        expect.objectContaining({
          status: OutboxStatus.DEAD,
          lastError: expect.stringContaining('eventPayload'),
        }),
      )
      // operation 也标记 DEAD
      expect(operationRepo.update).toHaveBeenCalledWith(
        { id: 'op-001' },
        { status: CreditOperationStatus.DEAD },
      )
    })
  })

  // -------------------- processOnce：编排 --------------------

  describe('processOnce — 端到端编排', () => {
    it('PENDING 记录被捞取并调用 billing（成功后标记 DELIVERED）', async () => {
      const claimed = [
        createOutbox({ id: 'outbox-a' }),
        createOutbox({ id: 'outbox-b', operationId: 'order-grant:order-002' }),
      ]
      const { consumer, query, outboxRepo, billingClient } = createConsumer({
        query: jest.fn().mockResolvedValue(claimed),
      })

      await consumer.processOnce()

      // claimBatch 被调用
      expect(query).toHaveBeenCalledTimes(1)
      // billing grant 被调用 2 次
      expect(billingClient.grant).toHaveBeenCalledTimes(2)
      // 两条记录都被标记 DELIVERED
      expect(outboxRepo.update).toHaveBeenCalledTimes(2)
      expect(outboxRepo.update).toHaveBeenNthCalledWith(
        1,
        { id: 'outbox-a' },
        expect.objectContaining({ status: OutboxStatus.DELIVERED }),
      )
      expect(outboxRepo.update).toHaveBeenNthCalledWith(
        2,
        { id: 'outbox-b' },
        expect.objectContaining({ status: OutboxStatus.DELIVERED }),
      )
    })

    it('claim 返回空数组时，不调用 billing', async () => {
      const { consumer, billingClient } = createConsumer({
        query: jest.fn().mockResolvedValue([]),
      })

      await consumer.processOnce()

      expect(billingClient.grant).not.toHaveBeenCalled()
    })

    it('running 标志防并发：上一次未跑完不重启', async () => {
      const claimed = [createOutbox()]
      const grant = jest
        .fn()
        .mockImplementation(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
      const { consumer, query, billingClient } = createConsumer({
        query: jest.fn().mockResolvedValue(claimed),
        billingClient: { grant } as never,
      })

      // 并行触发两次 processOnce
      const p1 = consumer.processOnce()
      const p2 = consumer.processOnce()
      await Promise.all([p1, p2])

      // 第二次因 running=true 应直接返回，billing 只被调用 1 次
      expect(query).toHaveBeenCalledTimes(1)
      expect(billingClient.grant).toHaveBeenCalledTimes(1)
    })
  })

  // -------------------- 生命周期 --------------------

  describe('onModuleInit / onModuleDestroy', () => {
    it('onModuleInit 启动定时器，onModuleDestroy 清理定时器（不抛错）', async () => {
      const { consumer } = createConsumer()

      expect(() => consumer.onModuleInit()).not.toThrow()
      expect(() => consumer.onModuleDestroy()).not.toThrow()
    })
  })
})
