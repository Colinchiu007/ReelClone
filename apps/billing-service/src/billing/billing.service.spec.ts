/**
 * BillingService 单元测试
 *
 * 覆盖：
 *  - getBalance：缓存命中 / 缓存未命中
 *  - freeze：V2 reservationMode=true 成功 / reservationMode=false 路由到 LedgerService（B3）
 *  - settle：成功
 *  - release：成功（operation 替代 tx）
 *  - grant：成功（operation 替代 tx）
 *  - reward：成功 / 幂等
 *  - listTransactions / getTransaction
 *  - 幂等机制：Redis 锁 owner token + Lua compare-delete（B2.3）+ 结果缓存
 */

import { BusinessException } from '@reelclone/common'
import {
  CreditOperation,
  CreditOperationStatus,
  CreditOperationType,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'
import { DataSource, ObjectLiteral, Repository } from 'typeorm'
import { BillingService } from './billing.service'
import { LedgerService } from './ledger.service'
import { CreditReservationService } from './credit-reservation.service'
import { ListTransactionsDto, TransactionDirection } from './dto/list-transactions.dto'

// -------------------- Mock 工具 --------------------

/** 模拟 Redis 客户端（含 Lua eval compare-delete） */
function mockRedis(): Record<string, jest.Mock> {
  const store = new Map<string, string>()
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ...rest: unknown[]) => {
      let nx = false
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === 'NX') nx = true
      }
      if (nx && store.has(key)) return null
      store.set(key, value)
      return 'OK'
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key)
      return 1
    }),
    // Lua compare-delete：仅当 key 的值 == owner 时才删除
    eval: jest.fn(async (_script: string, _numkeys: number, key: string, owner: string) => {
      if (store.get(key) === owner) {
        store.delete(key)
        return 1
      }
      return 0
    }),
    _store: store,
  } as unknown as Record<string, jest.Mock>
}

/** 模拟 Repository */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((e: unknown) => e),
    createQueryBuilder: jest.fn(),
    count: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

describe('BillingService', () => {
  let service: BillingService
  let redis: Record<string, jest.Mock>
  let mainDataSource: jest.Mocked<DataSource>
  let billingDataSource: jest.Mocked<DataSource>
  let ledger: jest.Mocked<LedgerService>
  let creditReservations: jest.Mocked<CreditReservationService>
  let userRepo: jest.Mocked<Repository<User>>
  let txRepo: jest.Mocked<Repository<PointTransaction>>

  beforeEach(() => {
    redis = mockRedis()
    userRepo = mockRepo<User>()
    txRepo = mockRepo<PointTransaction>()

    mainDataSource = {
      getRepository: jest.fn(() => userRepo),
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>

    billingDataSource = {
      getRepository: jest.fn(() => txRepo),
    } as unknown as jest.Mocked<DataSource>

    ledger = {
      freeze: jest.fn(),
      settle: jest.fn(),
      release: jest.fn(),
      grant: jest.fn(),
      reward: jest.fn(),
      consume: jest.fn(),
      getFrozenBalance: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findOperationByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      lockUser: jest.fn(),
      writeTransaction: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>

    creditReservations = {
      freeze: jest.fn(),
      settle: jest.fn(),
      release: jest.fn(),
      findReservation: jest.fn(),
      projectPending: jest.fn(),
    } as unknown as jest.Mocked<CreditReservationService>

    service = new BillingService(
      redis as never,
      mainDataSource,
      billingDataSource,
      ledger,
      creditReservations,
    )
  })

  // -------------------- getBalance --------------------

  describe('getBalance', () => {
    it('缓存命中时直接返回缓存值', async () => {
      await redis.set(`points:balance:u1`, '100', 'EX', 60)
      await redis.set(`points:frozen:u1`, '20', 'EX', 60)

      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '500' }),
      }
      userRepo.createQueryBuilder.mockReturnValue(qb as never)

      const result = await service.getBalance('u1')
      expect(result).toEqual({ balance: 100, frozen: 20, total: 500 })
      expect(userRepo.findOne).not.toHaveBeenCalled()
    })

    it('缓存未命中时查 DB 并回填缓存', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 500 }
      userRepo.findOne.mockResolvedValue(user as User)
      ledger.getFrozenBalance.mockResolvedValue(20)

      const result = await service.getBalance('u1')
      expect(result).toEqual({ balance: 100, frozen: 20, total: 500 })
      expect(redis.set).toHaveBeenCalledWith('points:balance:u1', '100', 'EX', 60)
      expect(redis.set).toHaveBeenCalledWith('points:frozen:u1', '20', 'EX', 60)
    })

    it('用户不存在时抛异常', async () => {
      userRepo.findOne.mockResolvedValue(null)
      await expect(service.getBalance('nope')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- listTransactions --------------------

  describe('listTransactions', () => {
    it('应该分页返回流水', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 't1' } as PointTransaction], 1]),
      }
      txRepo.createQueryBuilder.mockReturnValue(qb as never)

      const result = await service.listTransactions('u1', new ListTransactionsDto())
      expect(result.list).toHaveLength(1)
      expect(result.page).toBe(1)
      expect(result.total).toBe(1)
    })

    it('支持 type 与 direction 过滤', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      }
      txRepo.createQueryBuilder.mockReturnValue(qb as never)

      const dto = new ListTransactionsDto()
      dto.type = PointTransactionType.FREEZE
      dto.direction = TransactionDirection.DEBIT

      await service.listTransactions('u1', dto)
      expect(qb.andWhere).toHaveBeenCalled()
    })
  })

  // -------------------- getTransaction --------------------

  describe('getTransaction', () => {
    it('找到时返回流水', async () => {
      const tx: Partial<PointTransaction> = { id: 't1', userId: 'u1' }
      ledger.findById.mockResolvedValue(tx as PointTransaction)
      const result = await service.getTransaction('u1', 't1')
      expect(result.id).toBe('t1')
    })

    it('未找到时抛异常', async () => {
      ledger.findById.mockResolvedValue(null)
      await expect(service.getTransaction('u1', 'nope')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- freeze（B2.2: reservationMode 强制） --------------------

  describe('freeze', () => {
    it('V2 生成预留走 main 权威预留，不以 billing 流水作为幂等事实', async () => {
      creditReservations.freeze.mockResolvedValue({
        transactionId: 'reservation-1',
        balance: 90,
      })

      const result = await service.freeze({
        userId: 'u1',
        workId: 'w1',
        amount: 10,
        idempotencyKey: 'v2-freeze',
        reservationMode: true,
      })

      expect(result.transactionId).toBe('reservation-1')
      expect(creditReservations.freeze).toHaveBeenCalledWith(
        expect.objectContaining({ workId: 'w1', idempotencyKey: 'v2-freeze' }),
      )
      expect(ledger.findByIdempotencyKey).not.toHaveBeenCalled()
      expect(ledger.freeze).not.toHaveBeenCalled()
    })

    it('V2 主事务成功后缓存失效失败仍返回成功结果', async () => {
      creditReservations.freeze.mockResolvedValue({
        transactionId: 'reservation-1',
        balance: 90,
      })
      redis.del.mockRejectedValueOnce(new Error('redis unavailable'))

      await expect(
        service.freeze({
          userId: 'u1',
          workId: 'w1',
          amount: 10,
          idempotencyKey: 'v2-freeze-cache-failure',
          reservationMode: true,
        }),
      ).resolves.toMatchObject({ transactionId: 'reservation-1', balance: 90 })
    })

    it('B3: reservationMode=false 时路由到 LedgerService（benchmark 等非生成场景）', async () => {
      ledger.freeze.mockResolvedValue({
        freezeId: 'op-freeze-001',
        balance: 90,
        frozen: 10,
        operation: {
          id: 'op-freeze-001',
          userId: 'u1',
          type: CreditOperationType.FREEZE,
          amount: -10,
          relatedOrderId: null,
          relatedTemplateId: null,
          relatedWorkId: null,
          requestFingerprint: 'fp1',
          idempotencyKey: 'k1',
          operationId: 'oid-1',
          status: CreditOperationStatus.CONFIRMED,
          metadata: { balanceAfter: 90 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k1',
        reservationMode: false,
      })

      expect(ledger.freeze).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', amount: 10, idempotencyKey: 'k1' }),
      )
      expect(creditReservations.freeze).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('B3: 缺少 reservationMode（undefined）时路由到 LedgerService', async () => {
      ledger.freeze.mockResolvedValue({
        freezeId: 'op-freeze-002',
        balance: 80,
        frozen: 20,
        operation: {
          id: 'op-freeze-002',
          userId: 'u1',
          type: CreditOperationType.FREEZE,
          amount: -20,
          relatedOrderId: null,
          relatedTemplateId: null,
          relatedWorkId: null,
          requestFingerprint: 'fp2',
          idempotencyKey: 'k2',
          operationId: 'oid-2',
          status: CreditOperationStatus.CONFIRMED,
          metadata: { balanceAfter: 80 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      const result = await service.freeze({
        userId: 'u1',
        amount: 20,
        idempotencyKey: 'k2',
      })

      expect(ledger.freeze).toHaveBeenCalled()
      expect(creditReservations.freeze).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  // -------------------- settle --------------------

  describe('settle', () => {
    it('成功时调用 LedgerService.settle', async () => {
      ledger.settle.mockResolvedValue({
        balance: 90,
        frozen: 0,
        tx: { id: 's1' } as PointTransaction,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const result = await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k2',
        freezeId: 'f1',
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('s1')
      expect(ledger.settle).toHaveBeenCalled()
    })

    it('B4: reservationMode=true 时路由到 CreditReservationService.settle', async () => {
      creditReservations.settle.mockResolvedValue({
        transactionId: 'reservation-1',
        balance: 70,
      })

      const result = await service.settle({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'benchmark-settle:bench-001:uuid',
        freezeId: 'reservation-1',
        reservationMode: true,
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('reservation-1')
      expect(result.balance).toBe(70)
      expect(creditReservations.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          amount: 30,
          freezeId: 'reservation-1',
          idempotencyKey: 'benchmark-settle:bench-001:uuid',
        }),
      )
      // reservationMode=true 走 CreditReservation，不走 LedgerService
      expect(ledger.settle).not.toHaveBeenCalled()
    })
  })

  // -------------------- release --------------------

  describe('release', () => {
    it('B4: reservationMode=true 成功时路由到 CreditReservationService.release', async () => {
      creditReservations.release.mockResolvedValue({
        transactionId: 'reservation-1',
        balance: 100,
      })

      const result = await service.release({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'benchmark-release:bench-001:uuid',
        freezeId: 'reservation-1',
        reservationMode: true,
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('reservation-1')
      expect(result.balance).toBe(100)
      expect(creditReservations.release).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          amount: 30,
          freezeId: 'reservation-1',
          idempotencyKey: 'benchmark-release:bench-001:uuid',
        }),
      )
      expect(ledger.release).not.toHaveBeenCalled()
    })

    it('V2 release 缺少权威预留时由 reservation 服务 fail closed', async () => {
      creditReservations.release.mockRejectedValue(
        BusinessException.validationError('旧版积分预留缺少可验证关联，需对账后处理'),
      )

      await expect(
        service.release({
          userId: 'u1',
          amount: 10,
          idempotencyKey: 'v2-legacy-release',
          freezeId: 'legacy-freeze',
          reservationMode: true,
        }),
      ).rejects.toThrow('旧版积分预留缺少可验证关联')

      expect(ledger.release).not.toHaveBeenCalled()
    })

    it('成功时调用 LedgerService.release（返回 operation）', async () => {
      ledger.release.mockResolvedValue({
        balance: 100,
        frozen: 0,
        operation: { id: 'r1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const result = await service.release({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k3',
        freezeId: 'f1',
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('r1')
      expect(ledger.release).toHaveBeenCalled()
    })
  })

  // -------------------- grant --------------------

  describe('grant', () => {
    it('成功时调用 LedgerService.grant（返回 operation）', async () => {
      ledger.grant.mockResolvedValue({
        balance: 130,
        frozen: 0,
        operation: { id: 'g1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const result = await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k4',
        orderId: 'o1',
        packageId: 'p1',
      })

      expect(result.success).toBe(true)
      expect(result.balance).toBe(130)
      expect(ledger.grant).toHaveBeenCalled()
    })
  })

  // -------------------- reward --------------------

  describe('reward', () => {
    it('成功时调用 LedgerService.reward 并失效缓存', async () => {
      ledger.reward.mockResolvedValue({
        balance: 120,
        frozen: 0,
        operation: { id: 'rw1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const result = await service.reward({
        userId: 'u1',
        amount: 20,
        templateId: 'tpl-1',
        idempotencyKey: 'k-rw-1',
      })

      expect(result.success).toBe(true)
      expect(result.balance).toBe(120)
      expect(result.transactionId).toBe('rw1')
      expect(ledger.reward).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          amount: 20,
          templateId: 'tpl-1',
          idempotencyKey: 'k-rw-1',
        }),
      )
      expect(redis.del).toHaveBeenCalledWith('points:balance:u1')
      expect(redis.del).toHaveBeenCalledWith('points:frozen:u1')
    })

    it('幂等：重复请求返回首次结果且不重复发放', async () => {
      ledger.reward.mockResolvedValue({
        balance: 120,
        frozen: 0,
        operation: { id: 'rw1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const first = await service.reward({
        userId: 'u1',
        amount: 20,
        templateId: 'tpl-1',
        idempotencyKey: 'k-rw-dup',
      })
      expect(first.transactionId).toBe('rw1')
      expect(first.balance).toBe(120)

      ledger.reward.mockClear()
      const second = await service.reward({
        userId: 'u1',
        amount: 20,
        templateId: 'tpl-1',
        idempotencyKey: 'k-rw-dup',
      })
      expect(second.transactionId).toBe('rw1')
      expect(second.balance).toBe(120)
      expect(ledger.reward).not.toHaveBeenCalled()
    })

    it('余额正确性：amount > 0 时余额增加', async () => {
      ledger.reward.mockResolvedValue({
        balance: 105,
        frozen: 0,
        operation: { id: 'rw2' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      const result = await service.reward({
        userId: 'u1',
        amount: 25,
        templateId: 'tpl-2',
        idempotencyKey: 'k-rw-2',
      })

      expect(result.success).toBe(true)
      expect(result.balance).toBe(105)
      expect(result.frozenAmount).toBe(25)
      expect(ledger.reward).toHaveBeenCalledWith(expect.objectContaining({ amount: 25 }))
    })

    it('reward 关联 templateId 透传到 LedgerService', async () => {
      ledger.reward.mockResolvedValue({
        balance: 200,
        frozen: 0,
        operation: { id: 'rw3' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      await service.reward({
        userId: 'u1',
        amount: 50,
        templateId: 'tpl-uuid-3',
        idempotencyKey: 'k-rw-3',
        description: '模板被使用奖励',
      })

      expect(ledger.reward).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'tpl-uuid-3',
          description: '模板被使用奖励',
        }),
      )
    })
  })

  // -------------------- 幂等：DB 中已存在流水 / 操作 --------------------

  describe('幂等机制 - DB 双重检查', () => {
    it('DB 中已有同 idempotencyKey 的旧版流水时直接返回，不执行业务', async () => {
      const existing: Partial<PointTransaction> = {
        id: 'old-tx',
        amount: -10,
        balance: 90,
        type: PointTransactionType.FREEZE,
      }
      ledger.findByIdempotencyKey.mockResolvedValue(existing as PointTransaction)

      const result = await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-existing',
        freezeId: 'f1',
      })

      expect(result.transactionId).toBe('old-tx')
      expect(ledger.settle).not.toHaveBeenCalled()
    })

    it('DB 中已有同 idempotencyKey 的 V2 CreditOperation 时直接返回', async () => {
      const existingOp: Partial<CreditOperation> = {
        id: 'op-existing',
        amount: -10,
        type: 'GRANT' as CreditOperation['type'],
        metadata: { balanceAfter: 80 },
      }
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(existingOp as CreditOperation)

      const result = await service.grant({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-op-existing',
        orderId: 'o1',
        packageId: 'p1',
      })

      expect(result.transactionId).toBe('op-existing')
      expect(result.balance).toBe(80)
      expect(ledger.grant).not.toHaveBeenCalled()
    })
  })

  // -------------------- B2.3: Redis lock owner token + Lua compare-delete --------------------

  describe('B2.3: Redis lock 安全释放', () => {
    it('锁值使用 owner token（UUID）而非固定值 "1"', async () => {
      ledger.grant.mockResolvedValue({
        balance: 130,
        frozen: 0,
        operation: { id: 'g1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k-lock-test',
        orderId: 'o1',
        packageId: 'p1',
      })

      // set 调用中第二个参数（value）应为 UUID 而非 '1'
      const lockSetCall = redis.set.mock.calls.find(
        (call: unknown[]) => call[0] === 'points:idem-lock:k-lock-test',
      )
      expect(lockSetCall).toBeDefined()
      const lockValue = lockSetCall![1] as string
      expect(lockValue).not.toBe('1')
      // UUID 格式：8-4-4-4-12
      expect(lockValue).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('释放锁使用 Lua eval（compare-delete），而非直接 del', async () => {
      ledger.grant.mockResolvedValue({
        balance: 130,
        frozen: 0,
        operation: { id: 'g1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k-eval-test',
        orderId: 'o1',
        packageId: 'p1',
      })

      // eval 应被调用来释放锁
      expect(redis.eval).toHaveBeenCalled()
      const evalCall = redis.eval.mock.calls[0]
      expect(evalCall[0]).toContain('redis.call("get"')
      expect(evalCall[0]).toContain('redis.call("del"')
    })

    it('B2.3: TTL 按操作类型设置 — settle 使用 5s（短操作）', async () => {
      ledger.settle.mockResolvedValue({
        balance: 90,
        frozen: 0,
        tx: { id: 's1' } as PointTransaction,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-settle-ttl',
        freezeId: 'f1',
      })

      const lockSetCall = redis.set.mock.calls.find(
        (call: unknown[]) => call[0] === 'points:idem-lock:k-settle-ttl',
      )
      expect(lockSetCall).toBeDefined()
      // 第 4 个参数是 TTL（'EX' 后面的值）
      const ttl = lockSetCall![3] as number
      expect(ttl).toBe(5)
    })

    it('B2.3: TTL 按操作类型设置 — release 使用 5s（短操作）', async () => {
      ledger.release.mockResolvedValue({
        balance: 100,
        frozen: 0,
        operation: { id: 'r1' } as CreditOperation,
      })
      ledger.findByIdempotencyKey.mockResolvedValue(null)
      ledger.findOperationByIdempotencyKey.mockResolvedValue(null)

      await service.release({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-release-ttl',
        freezeId: 'f1',
      })

      const lockSetCall = redis.set.mock.calls.find(
        (call: unknown[]) => call[0] === 'points:idem-lock:k-release-ttl',
      )
      expect(lockSetCall).toBeDefined()
      const ttl = lockSetCall![3] as number
      expect(ttl).toBe(5)
    })
  })

  // -------------------- countRewardsByTemplateId --------------------

  describe('countRewardsByTemplateId', () => {
    it('应按 templateId + REWARD 类型统计流水数', async () => {
      txRepo.count.mockResolvedValue(7)

      const result = await service.countRewardsByTemplateId('tmpl-001')

      expect(result).toBe(7)
      expect(txRepo.count).toHaveBeenCalledWith({
        where: { templateId: 'tmpl-001', type: PointTransactionType.REWARD },
      })
    })

    it('无奖励流水时返回 0', async () => {
      txRepo.count.mockResolvedValue(0)

      const result = await service.countRewardsByTemplateId('tmpl-new')

      expect(result).toBe(0)
    })
  })
})
