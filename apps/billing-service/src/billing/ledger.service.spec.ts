/**
 * LedgerService 单元测试（V2 CreditOperation 架构）
 *
 * 覆盖：
 *  - lockUser：悲观锁 + 用户不存在
 *  - getFrozenBalance：聚合查询
 *  - findByIdempotencyKey / findOperationByIdempotencyKey / findById
 *  - writeTransaction：流水写入（保留供投影使用）
 *  - freeze：成功（写 CreditOperation + outbox）/ 余额不足 / 幂等
 *  - settle：成功（保留旧版 PointTransaction 路径）/ 冻结流水不存在
 *  - release：成功（写 CreditOperation + outbox）/ 冻结流水不存在
 *  - grant：成功（写 CreditOperation + outbox，totalPoints 同步）
 *  - reward：成功（写 CreditOperation + outbox）
 *  - consume：成功（写 CreditOperation + outbox）/ 余额不足
 */
import { BusinessException } from '@reelclone/common'
import {
  CreditOperation,
  CreditOperationOutbox,
  CreditOperationType,
  CreditReservation,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'
import { DataSource, EntityManager, ObjectLiteral, Repository } from 'typeorm'
import { LedgerService } from './ledger.service'

// -------------------- Mock 工具 --------------------

function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (entity: unknown) => entity),
    create: jest.fn((entity: unknown) => entity),
    createQueryBuilder: jest.fn(),
  }
  return repo as unknown as jest.Mocked<Repository<T>>
}

function mockQueryBuilder<T>(result: T): jest.Mocked<unknown> {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(result as unknown[]),
    getRawOne: jest.fn().mockResolvedValue(result),
    getManyAndCount: jest.fn().mockResolvedValue([result, 0]),
  }
  return qb as unknown as jest.Mocked<unknown>
}

describe('LedgerService', () => {
  let service: LedgerService
  let mainDataSource: jest.Mocked<DataSource>
  let billingDataSource: jest.Mocked<DataSource>
  let mainUserRepo: jest.Mocked<Repository<User>>
  let mainReservationRepo: jest.Mocked<Repository<CreditReservation>>
  let operationRepo: jest.Mocked<Repository<CreditOperation>>
  let outboxRepo: jest.Mocked<Repository<CreditOperationOutbox>>
  let billingTxRepo: jest.Mocked<Repository<PointTransaction>>
  let txManager: jest.Mocked<EntityManager>

  beforeEach(() => {
    mainUserRepo = mockRepo<User>()
    mainReservationRepo = mockRepo<CreditReservation>()
    operationRepo = mockRepo<CreditOperation>()
    outboxRepo = mockRepo<CreditOperationOutbox>()
    billingTxRepo = mockRepo<PointTransaction>()

    txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return mainUserRepo
        if (entity === CreditOperation) return operationRepo
        if (entity === CreditOperationOutbox) return outboxRepo
        if (entity === CreditReservation) return mainReservationRepo
        return billingTxRepo
      }) as unknown as jest.Mocked<EntityManager>['getRepository'],
    } as unknown as jest.Mocked<EntityManager>

    mainDataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(txManager)),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === CreditReservation) return mainReservationRepo
        if (entity === CreditOperation) return operationRepo
        return mainUserRepo
      }),
    } as unknown as jest.Mocked<DataSource>

    billingDataSource = {
      getRepository: jest.fn(() => billingTxRepo),
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) => cb(txManager)),
    } as unknown as jest.Mocked<DataSource>

    service = new LedgerService(mainDataSource, billingDataSource)

    mainReservationRepo.createQueryBuilder.mockReturnValue(
      mockQueryBuilder({ frozen: '0' }) as never,
    )
    billingTxRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder({ frozen: '0' }) as never)
    operationRepo.findOne.mockResolvedValue(null)
  })

  // -------------------- lockUser --------------------

  describe('lockUser', () => {
    it('应该返回锁定的用户', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)

      const result = await service.lockUser(txManager, 'u1')
      expect(result).toMatchObject({ id: 'u1', currentPoints: 100 })
    })

    it('用户不存在时抛 BusinessException', async () => {
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(null) as never)
      await expect(service.lockUser(txManager, 'nope')).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- getFrozenBalance --------------------

  describe('getFrozenBalance', () => {
    it('应该返回聚合的冻结余额', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder({ frozen: '50' }) as never)
      const result = await service.getFrozenBalance('u1')
      expect(result).toBe(50)
    })

    it('无记录时返回 0', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder({ frozen: null }) as never)
      const result = await service.getFrozenBalance('u1')
      expect(result).toBe(0)
    })
  })

  // -------------------- findByIdempotencyKey / findOperationByIdempotencyKey --------------------

  describe('findByIdempotencyKey', () => {
    it('找到时返回流水', async () => {
      const tx: Partial<PointTransaction> = { id: 't1', idempotencyKey: 'k1' }
      billingTxRepo.findOne.mockResolvedValue(tx as PointTransaction)
      const result = await service.findByIdempotencyKey('k1')
      expect(result).toMatchObject({ id: 't1' })
    })

    it('未找到时返回 null', async () => {
      billingTxRepo.findOne.mockResolvedValue(null)
      const result = await service.findByIdempotencyKey('k1')
      expect(result).toBeNull()
    })
  })

  describe('findOperationByIdempotencyKey', () => {
    it('找到时返回 CreditOperation', async () => {
      const op: Partial<CreditOperation> = {
        id: 'op-1',
        idempotencyKey: 'k1',
        type: CreditOperationType.GRANT,
      }
      operationRepo.findOne.mockResolvedValue(op as CreditOperation)
      const result = await service.findOperationByIdempotencyKey('k1')
      expect(result).toMatchObject({ id: 'op-1' })
    })

    it('未找到时返回 null', async () => {
      operationRepo.findOne.mockResolvedValue(null)
      const result = await service.findOperationByIdempotencyKey('k1')
      expect(result).toBeNull()
    })
  })

  describe('findById', () => {
    it('指定 userId 时附加过滤', async () => {
      billingTxRepo.findOne.mockResolvedValue(null)
      await service.findById('t1', 'u1')
      expect(billingTxRepo.findOne).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1' },
      })
    })
  })

  // -------------------- writeTransaction --------------------

  describe('writeTransaction', () => {
    it('应该写入流水并返回', async () => {
      const saved: Partial<PointTransaction> = {
        id: 't-new',
        type: PointTransactionType.FREEZE,
      }
      billingTxRepo.save.mockResolvedValue(saved as PointTransaction)

      const result = await service.writeTransaction({
        userId: 'u1',
        type: PointTransactionType.FREEZE,
        amount: -10,
        balanceAfter: 90,
        idempotencyKey: 'k1',
        description: 'freeze 10',
        workId: 'w1',
      })

      expect(result).toMatchObject({ id: 't-new' })
      expect(billingTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: PointTransactionType.FREEZE,
          amount: -10,
          balance: 90,
          idempotencyKey: 'k1',
        }),
      )
      expect(billingTxRepo.save).toHaveBeenCalled()
    })
  })

  // -------------------- freeze --------------------

  describe('freeze', () => {
    it('余额充足时写 CreditOperation + outbox 并扣减余额', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-freeze-1',
        type: CreditOperationType.FREEZE,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k1',
        workId: 'w1',
        description: 'test freeze',
      })

      expect(result.freezeId).toBe('op-freeze-1')
      expect(result.balance).toBe(90)
      expect(result.operation.id).toBe('op-freeze-1')
      expect(mainUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentPoints: 90 }))
      expect(operationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: CreditOperationType.FREEZE,
          amount: -10,
        }),
      )
      expect(operationRepo.save).toHaveBeenCalled()
      expect(outboxRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }))
      expect(outboxRepo.save).toHaveBeenCalled()
      // 删除 direct dual-write：不应直接写 billing PointTransaction
      expect(billingTxRepo.save).not.toHaveBeenCalled()
    })

    it('余额不足时抛 BusinessException', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 5, totalPoints: 5 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)

      await expect(
        service.freeze({ userId: 'u1', amount: 10, idempotencyKey: 'k1' }),
      ).rejects.toThrow(BusinessException)
    })

    it('幂等：相同 idempotencyKey 已有 CreditOperation 时返回已有记录', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 90, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      const existing: Partial<CreditOperation> = {
        id: 'op-existing',
        type: CreditOperationType.FREEZE,
        amount: -10,
      }
      operationRepo.findOne.mockResolvedValue(existing as CreditOperation)

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-dup',
        workId: 'w1',
      })

      expect(result.operation.id).toBe('op-existing')
      expect(operationRepo.save).not.toHaveBeenCalled()
      expect(outboxRepo.save).not.toHaveBeenCalled()
    })

    // B3: reservationMode 检查已移至 BillingService，LedgerService 不再关心该参数

    it('B3: reservationMode=false 时正常执行（benchmark 等非生成场景）', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-freeze-bench',
        type: CreditOperationType.FREEZE,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-bench',
        reservationMode: false,
      })

      expect(result.freezeId).toBe('op-freeze-bench')
      expect(operationRepo.save).toHaveBeenCalled()
    })

    it('B3: reservationMode=undefined 时正常执行（向后兼容）', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-freeze-ok',
        type: CreditOperationType.FREEZE,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-no-res-mode',
        workId: 'w1',
      })

      expect(result.freezeId).toBe('op-freeze-ok')
      expect(operationRepo.save).toHaveBeenCalled()
    })

    it('B2.4: 幂等重放不产生副作用 — 相同 idempotencyKey+fingerprint 不重复写入', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 90, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      const existing: Partial<CreditOperation> = {
        id: 'op-replay',
        type: CreditOperationType.FREEZE,
        amount: -10,
        idempotencyKey: 'k-replay',
      }
      operationRepo.findOne.mockResolvedValue(existing as CreditOperation)

      // 第一次调用（重放）
      const first = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-replay',
        workId: 'w1',
      })
      // 第二次调用（再次重放）
      const second = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-replay',
        workId: 'w1',
      })

      expect(first.operation.id).toBe('op-replay')
      expect(second.operation.id).toBe('op-replay')
      // 不应重复创建 operation 或 outbox
      expect(operationRepo.create).not.toHaveBeenCalled()
      expect(outboxRepo.save).not.toHaveBeenCalled()
      // 不应重复扣减余额
      expect(mainUserRepo.save).not.toHaveBeenCalled()
    })
  })

  // -------------------- settle（保留旧版 PointTransaction 路径） --------------------

  describe('settle', () => {
    it('冻结余额充足时写入 SETTLE 流水（旧版路径）', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        workId: 'w1',
        amount: -10,
        reservationId: null,
      }
      const user: Partial<User> = { id: 'u1', currentPoints: 90 }
      billingTxRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder(freezeTx) as never)
        .mockReturnValueOnce(mockQueryBuilder(null) as never)
        .mockReturnValueOnce(mockQueryBuilder({ frozen: '0' }) as never)
      mainUserRepo.findOne.mockResolvedValue(user as User)
      const tx: Partial<PointTransaction> = { id: 'settle-1', type: PointTransactionType.SETTLE }
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction)

      const result = await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k2',
        freezeId: 'f1',
      })

      expect(result.balance).toBe(90)
      expect(result.tx.id).toBe('settle-1')
    })

    it('FREEZE 流水不存在时抛异常', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder(null) as never)
      await expect(
        service.settle({ userId: 'u1', amount: 10, idempotencyKey: 'k2', freezeId: 'f-nope' }),
      ).rejects.toThrow(BusinessException)
    })

    it('请求金额与冻结预留不一致时抛异常', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        amount: -5,
      }
      billingTxRepo.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder(freezeTx) as never)

      await expect(
        service.settle({ userId: 'u1', amount: 10, idempotencyKey: 'k2', freezeId: 'f1' }),
      ).rejects.toThrow(BusinessException)
    })
  })

  // -------------------- release --------------------

  describe('release', () => {
    it('冻结余额充足时返还可用余额并写 CreditOperation + outbox', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        workId: 'w1',
        amount: -10,
        reservationId: null,
      }
      billingTxRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder(freezeTx) as never)
        .mockReturnValueOnce(mockQueryBuilder(null) as never)
        .mockReturnValueOnce(mockQueryBuilder({ frozen: '0' }) as never)
      const user: Partial<User> = { id: 'u1', currentPoints: 90 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-release-1',
        type: CreditOperationType.RELEASE,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.release({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k3',
        freezeId: 'f1',
      })

      expect(result.balance).toBe(100)
      expect(result.operation.id).toBe('op-release-1')
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPoints: 100 }),
      )
      expect(operationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CreditOperationType.RELEASE,
          amount: 10,
        }),
      )
      expect(billingTxRepo.save).not.toHaveBeenCalled()
    })

    it('FREEZE 流水不存在时抛异常', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder(null) as never)
      await expect(
        service.release({ userId: 'u1', amount: 10, idempotencyKey: 'k3', freezeId: 'f-nope' }),
      ).rejects.toThrow(BusinessException)
    })

    it('已结算或释放的冻结预留不能再次释放', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        amount: -10,
      }
      const terminalTx: Partial<PointTransaction> = {
        id: 'settle-1',
        type: PointTransactionType.SETTLE,
        freezeId: 'f1',
      }
      billingTxRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder(freezeTx) as never)
        .mockReturnValueOnce(mockQueryBuilder(terminalTx) as never)

      await expect(
        service.release({ userId: 'u1', amount: 10, idempotencyKey: 'k3', freezeId: 'f1' }),
      ).rejects.toThrow(BusinessException)
      expect(mainUserRepo.save).not.toHaveBeenCalled()
    })

    it('V2 投影的 FREEZE 流水不能通过旧版接口释放', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f-v2',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        amount: -10,
        reservationId: 'reservation-v2',
      }
      billingTxRepo.createQueryBuilder.mockReturnValueOnce(mockQueryBuilder(freezeTx) as never)

      await expect(
        service.release({ userId: 'u1', amount: 10, idempotencyKey: 'k-v2', freezeId: 'f-v2' }),
      ).rejects.toThrow(BusinessException)
      expect(mainUserRepo.save).not.toHaveBeenCalled()
      expect(operationRepo.save).not.toHaveBeenCalled()
    })

    // B2.4: FREEZE + RELEASE 配对验证

    it('B2.4: FREEZE 100 + RELEASE 100 后余额回到初始', async () => {
      // ---- FREEZE: 100 → 0 ----
      const freezeUser: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(freezeUser) as never)
      mainUserRepo.save.mockImplementation(async (entity: unknown) => entity as User)
      const freezeOp: Partial<CreditOperation> = {
        id: 'op-freeze-pair',
        type: CreditOperationType.FREEZE,
        amount: -100,
      }
      operationRepo.save.mockResolvedValue(freezeOp as CreditOperation)

      const freezeResult = await service.freeze({
        userId: 'u1',
        amount: 100,
        idempotencyKey: 'pair-freeze',
        workId: 'w1',
      })
      expect(freezeResult.balance).toBe(0)
      expect(freezeResult.operation.amount).toBe(-100)
      // 验证 freeze 扣减了余额
      expect(mainUserRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentPoints: 0 }))

      // ---- RELEASE: 0 → 100 ----
      // lockOpenFreeze 需要查到历史冻结流水（billing 库）
      const freezeTx: Partial<PointTransaction> = {
        id: 'f-pair',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        amount: -100,
        reservationId: null,
      }
      billingTxRepo.createQueryBuilder
        .mockReturnValueOnce(mockQueryBuilder(freezeTx) as never) // lockOpenFreeze: 查找冻结流水
        .mockReturnValueOnce(mockQueryBuilder(null) as never) // lockOpenFreeze: 检查终态流水

      const releaseUser: Partial<User> = { id: 'u1', currentPoints: 0, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(releaseUser) as never)
      const releaseOp: Partial<CreditOperation> = {
        id: 'op-release-pair',
        type: CreditOperationType.RELEASE,
        amount: 100,
      }
      operationRepo.save.mockResolvedValue(releaseOp as CreditOperation)

      const releaseResult = await service.release({
        userId: 'u1',
        amount: 100,
        idempotencyKey: 'pair-release',
        freezeId: 'f-pair',
      })
      expect(releaseResult.balance).toBe(100)
      expect(releaseResult.operation.amount).toBe(100)
      // 验证 release 恢复了余额
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPoints: 100 }),
      )

      // 净效果：FREEZE(-100) + RELEASE(+100) = 0，余额回到初始 100
    })
  })

  describe('grant', () => {
    it('应该增加 currentPoints 和 totalPoints，写 CreditOperation + outbox', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 50, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-grant-1',
        type: CreditOperationType.GRANT,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k4',
        orderId: 'o1',
        packageId: 'p1',
      })

      expect(result.balance).toBe(80)
      expect(result.operation.id).toBe('op-grant-1')
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPoints: 80, totalPoints: 130 }),
      )
      expect(operationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CreditOperationType.GRANT,
          amount: 30,
          relatedOrderId: 'o1',
        }),
      )
      expect(billingTxRepo.save).not.toHaveBeenCalled()
    })
  })

  // -------------------- reward --------------------

  describe('reward', () => {
    it('应该增加余额并写 CreditOperation + outbox，关联 templateId', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 80, totalPoints: 200 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-reward-1',
        type: CreditOperationType.REWARD,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.reward({
        userId: 'u1',
        amount: 20,
        idempotencyKey: 'k5',
        templateId: 'tpl-1',
      })

      expect(result.balance).toBe(100)
      expect(result.operation.id).toBe('op-reward-1')
      expect(operationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CreditOperationType.REWARD,
          amount: 20,
          relatedTemplateId: 'tpl-1',
        }),
      )
      // B6: REWARD 即时投影到 billing 库 PointTransaction
      expect(billingTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: PointTransactionType.REWARD,
          amount: 20,
          templateId: 'tpl-1',
        }),
      )
    })

    it('B6: billing 库投影失败不应阻塞 main 库事务', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 80, totalPoints: 200 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-reward-2',
        type: CreditOperationType.REWARD,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)
      // 模拟 billing 库投影失败
      billingTxRepo.save.mockRejectedValueOnce(new Error('billing DB unavailable'))

      const result = await service.reward({
        userId: 'u1',
        amount: 20,
        idempotencyKey: 'k6',
        templateId: 'tpl-1',
      })

      // main 库操作应正常完成
      expect(result.balance).toBe(100)
      expect(result.operation.id).toBe('op-reward-2')
      expect(operationRepo.save).toHaveBeenCalled()
    })
  })

  // -------------------- consume --------------------

  describe('consume', () => {
    it('余额充足时直接扣减并写 CreditOperation + outbox', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)
      mainUserRepo.save.mockResolvedValue(user as User)
      const operation: Partial<CreditOperation> = {
        id: 'op-consume-1',
        type: CreditOperationType.CONSUME,
      }
      operationRepo.save.mockResolvedValue(operation as CreditOperation)

      const result = await service.consume({
        userId: 'u1',
        amount: 20,
        idempotencyKey: 'k6',
      })

      expect(result.balance).toBe(80)
      expect(result.operation.id).toBe('op-consume-1')
      expect(operationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CreditOperationType.CONSUME,
          amount: -20,
        }),
      )
      expect(billingTxRepo.save).not.toHaveBeenCalled()
    })

    it('余额不足时抛 BusinessException', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 5, totalPoints: 5 }
      mainUserRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder(user) as never)

      await expect(
        service.consume({ userId: 'u1', amount: 20, idempotencyKey: 'k6' }),
      ).rejects.toThrow(BusinessException)
    })
  })
})
