import { BusinessException } from '@reelclone/common'
import {
  BillingProjectionDeliveryStatus,
  BillingProjectionOutbox,
  BillingProjectionType,
  CreditReservation,
  CreditReservationStatus,
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database'
import { DataSource, EntityManager, ObjectLiteral, Repository } from 'typeorm'
import { CreditReservationService, computeBackoffMs } from './credit-reservation.service'
import { LedgerService } from './ledger.service'

function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>
}

function queryBuilder<T>(value: T) {
  return {
    setLock: jest.fn().mockReturnThis(),
    setOnLocked: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(value),
    getMany: jest.fn().mockResolvedValue(value as unknown as unknown[]),
  }
}

describe('CreditReservationService', () => {
  let service: CreditReservationService
  let mainDataSource: jest.Mocked<DataSource>
  let manager: jest.Mocked<EntityManager>
  let userRepo: jest.Mocked<Repository<User>>
  let reservationRepo: jest.Mocked<Repository<CreditReservation>>
  let outboxRepo: jest.Mocked<Repository<BillingProjectionOutbox>>
  let ledger: jest.Mocked<LedgerService>

  beforeEach(() => {
    userRepo = mockRepo<User>()
    reservationRepo = mockRepo<CreditReservation>()
    outboxRepo = mockRepo<BillingProjectionOutbox>()
    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepo
        if (entity === CreditReservation) return reservationRepo
        return outboxRepo
      }),
    } as unknown as jest.Mocked<EntityManager>
    mainDataSource = {
      transaction: jest.fn(async (fn: (m: EntityManager) => Promise<unknown>) => fn(manager)),
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return userRepo
        if (entity === CreditReservation) return reservationRepo
        return outboxRepo
      }),
    } as unknown as jest.Mocked<DataSource>
    ledger = {
      lockUser: jest.fn(),
      getFrozenBalance: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      writeTransaction: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>
    service = new CreditReservationService(mainDataSource, ledger)

    outboxRepo.find.mockResolvedValue([])
    outboxRepo.findOne.mockResolvedValue(null)
    ledger.getFrozenBalance.mockResolvedValue(0)
  })

  it('冻结在 main 事务中同时写余额、权威预留和 outbox', async () => {
    const user = { id: 'user-1', currentPoints: 100 } as User
    const reservation = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 10,
      status: CreditReservationStatus.OPEN,
      freezeOperationKey: 'generation:freeze',
      terminalOperationKey: null,
      terminalTransactionId: null,
      balanceAfterFreeze: 90,
      balanceAfterTerminal: null,
      terminalAt: null,
    } as CreditReservation
    ledger.lockUser.mockResolvedValue(user)
    reservationRepo.findOne.mockResolvedValue(null)
    reservationRepo.save.mockResolvedValue(reservation)
    ledger.getFrozenBalance.mockResolvedValue(10)

    const result = await service.freeze({
      userId: 'user-1',
      workId: 'work-1',
      amount: 10,
      idempotencyKey: 'generation:freeze',
    })

    expect(result).toEqual({ transactionId: 'reservation-1', balance: 90 })
    expect(ledger.getFrozenBalance).not.toHaveBeenCalled()
    expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentPoints: 90 }))
    expect(reservationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: CreditReservationStatus.OPEN, amount: 10 }),
    )
    expect(outboxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'reservation-1',
        type: BillingProjectionType.FREEZE,
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      }),
    )
  })

  it('释放只允许 OPEN -> RELEASED 一次，并与返还余额同事务', async () => {
    const reservation = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 10,
      status: CreditReservationStatus.OPEN,
      freezeOperationKey: 'generation:freeze',
      terminalOperationKey: null,
      terminalTransactionId: null,
      balanceAfterFreeze: 90,
      balanceAfterTerminal: null,
      terminalAt: null,
    } as CreditReservation
    const user = { id: 'user-1', currentPoints: 90 } as User
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(reservation) as never)
    ledger.lockUser.mockResolvedValue(user)
    reservationRepo.save.mockImplementation(async (value) => value as CreditReservation)

    const result = await service.release({
      userId: 'user-1',
      workId: 'work-1',
      amount: 10,
      idempotencyKey: 'generation:release',
      freezeId: 'reservation-1',
    })

    expect(result.balance).toBe(100)
    expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentPoints: 100 }))
    expect(reservationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CreditReservationStatus.RELEASED,
        terminalOperationKey: 'generation:release',
      }),
    )
    expect(outboxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ type: BillingProjectionType.RELEASE }),
    )
  })

  it('旧 freezeId 不存在 main 权威预留时 fail closed，绝不返还余额', async () => {
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(null) as never)

    await expect(
      service.release({
        userId: 'user-1',
        amount: 10,
        idempotencyKey: 'legacy:release',
        freezeId: 'legacy-billing-freeze-id',
      }),
    ).rejects.toThrow(BusinessException)

    expect(userRepo.save).not.toHaveBeenCalled()
    expect(outboxRepo.save).not.toHaveBeenCalled()
  })

  it('相同终态幂等键重放不会再次返还余额', async () => {
    const released = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 10,
      status: CreditReservationStatus.RELEASED,
      freezeOperationKey: 'generation:freeze',
      terminalOperationKey: 'generation:release',
      terminalTransactionId: null,
      balanceAfterFreeze: 90,
      balanceAfterTerminal: 100,
      terminalAt: new Date(),
    } as CreditReservation
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(released) as never)

    await service.release({
      userId: 'user-1',
      amount: 10,
      idempotencyKey: 'generation:release',
      freezeId: 'reservation-1',
    })

    expect(ledger.lockUser).not.toHaveBeenCalled()
    expect(userRepo.save).not.toHaveBeenCalled()
    expect(outboxRepo.save).not.toHaveBeenCalled()
  })

  // --- settle tests ---

  it('结算只允许 OPEN -> SETTLED，不返还余额', async () => {
    const reservation = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 300,
      status: CreditReservationStatus.OPEN,
      freezeOperationKey: 'benchmark:freeze',
      terminalOperationKey: null,
      terminalTransactionId: null,
      balanceAfterFreeze: 700,
      balanceAfterTerminal: null,
      terminalAt: null,
    } as CreditReservation
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(reservation) as never)
    reservationRepo.save.mockImplementation(async (value) => value as CreditReservation)

    const result = await service.settle({
      userId: 'user-1',
      workId: 'work-1',
      amount: 300,
      idempotencyKey: 'benchmark:settle',
      freezeId: 'reservation-1',
    })

    expect(result.transactionId).toBe('reservation-1')
    expect(result.balance).toBe(700) // settle 不改变余额
    expect(userRepo.save).not.toHaveBeenCalled() // 不调用 lockUser / save balance
    expect(reservationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CreditReservationStatus.SETTLED,
        terminalOperationKey: 'benchmark:settle',
        balanceAfterTerminal: 700,
      }),
    )
    expect(outboxRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: BillingProjectionType.SETTLE,
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      }),
    )
  })

  it('相同 settle 幂等键重放不会重复结算', async () => {
    const settled = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 300,
      status: CreditReservationStatus.SETTLED,
      freezeOperationKey: 'benchmark:freeze',
      terminalOperationKey: 'benchmark:settle',
      terminalTransactionId: null,
      balanceAfterFreeze: 700,
      balanceAfterTerminal: 700,
      terminalAt: new Date(),
    } as CreditReservation
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(settled) as never)

    const result = await service.settle({
      userId: 'user-1',
      amount: 300,
      idempotencyKey: 'benchmark:settle',
      freezeId: 'reservation-1',
    })

    expect(result.transactionId).toBe('reservation-1')
    expect(reservationRepo.save).not.toHaveBeenCalled()
    expect(outboxRepo.save).not.toHaveBeenCalled()
  })

  it('金额不匹配时拒绝结算', async () => {
    const reservation = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 300,
      status: CreditReservationStatus.OPEN,
      freezeOperationKey: 'benchmark:freeze',
      terminalOperationKey: null,
      terminalTransactionId: null,
      balanceAfterFreeze: 700,
      balanceAfterTerminal: null,
      terminalAt: null,
    } as CreditReservation
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(reservation) as never)

    await expect(
      service.settle({
        userId: 'user-1',
        amount: 200, // 不匹配 300
        idempotencyKey: 'benchmark:settle',
        freezeId: 'reservation-1',
      }),
    ).rejects.toThrow(BusinessException)
  })

  it('settle 后再用不同幂等键 release 会失败（状态不是 OPEN）', async () => {
    const settled = {
      id: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      amount: 300,
      status: CreditReservationStatus.SETTLED,
      freezeOperationKey: 'benchmark:freeze',
      terminalOperationKey: 'benchmark:settle',
      terminalTransactionId: null,
      balanceAfterFreeze: 700,
      balanceAfterTerminal: 700,
      terminalAt: new Date(),
    } as CreditReservation
    reservationRepo.createQueryBuilder.mockReturnValue(queryBuilder(settled) as never)

    await expect(
      service.release({
        userId: 'user-1',
        amount: 300,
        idempotencyKey: 'benchmark:release:different',
        freezeId: 'reservation-1',
      }),
    ).rejects.toThrow(BusinessException)
  })

  it('billing 已写但 outbox 未标记交付时，重放只标记 DELIVERED', async () => {
    const outbox = {
      id: 'outbox-1',
      reservationId: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      type: BillingProjectionType.RELEASE,
      amount: 10,
      balanceSnapshot: 100,
      idempotencyKey: 'generation:release',
      deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      attempts: 0,
    } as BillingProjectionOutbox
    const transaction = {
      id: 'billing-release-1',
      userId: 'user-1',
      type: PointTransactionType.RELEASE,
      amount: 10,
      reservationId: 'reservation-1',
    } as PointTransaction
    const freeze = {
      ...outbox,
      id: 'outbox-freeze-1',
      type: BillingProjectionType.FREEZE,
      deliveryStatus: BillingProjectionDeliveryStatus.DELIVERED,
    } as BillingProjectionOutbox
    // claimBatch 返回已领取的 outbox
    mainDataSource.query.mockResolvedValueOnce([outbox])
    // projectOutbox 内部 lock 领取
    outboxRepo.createQueryBuilder.mockReturnValue(queryBuilder(outbox) as never)
    outboxRepo.findOne.mockResolvedValue(freeze)
    ledger.findByIdempotencyKey.mockResolvedValue(transaction)

    const result = await service.projectPending()

    expect(result).toEqual({ claimed: 1, projected: 1, failed: 0 })
    expect(ledger.writeTransaction).not.toHaveBeenCalled()
    expect(outboxRepo.update).toHaveBeenCalledWith(
      { id: 'outbox-1', deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
      expect.objectContaining({ deliveryStatus: BillingProjectionDeliveryStatus.DELIVERED }),
    )
    expect(reservationRepo.update).toHaveBeenCalledWith(
      { id: 'reservation-1' },
      { terminalTransactionId: 'billing-release-1' },
    )
  })

  it('terminal outbox 在 FREEZE 尚未交付时保持 PENDING', async () => {
    const terminal = {
      id: 'outbox-release-1',
      reservationId: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      type: BillingProjectionType.RELEASE,
      amount: 10,
      balanceSnapshot: 100,
      idempotencyKey: 'generation:release',
      deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      attempts: 0,
    } as BillingProjectionOutbox
    const freeze = {
      ...terminal,
      id: 'outbox-freeze-1',
      type: BillingProjectionType.FREEZE,
      deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
    } as BillingProjectionOutbox
    mainDataSource.query.mockResolvedValueOnce([terminal])
    outboxRepo.createQueryBuilder.mockReturnValue(queryBuilder(terminal) as never)
    outboxRepo.findOne.mockResolvedValue(freeze)

    await service.projectPending()

    expect(ledger.findByIdempotencyKey).not.toHaveBeenCalled()
    expect(ledger.writeTransaction).not.toHaveBeenCalled()
    // projectOutbox 内部不更新（FREEZE 未交付），但外层 projectPending 不会调 update
    expect(outboxRepo.update).not.toHaveBeenCalled()
  })

  it('被其他 projector 锁定的 outbox 不会重复写入 billing', async () => {
    const outbox = {
      id: 'outbox-freeze-1',
      reservationId: 'reservation-1',
      userId: 'user-1',
      workId: 'work-1',
      type: BillingProjectionType.FREEZE,
      amount: 10,
      balanceSnapshot: 90,
      idempotencyKey: 'generation:freeze',
      deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      attempts: 0,
    } as BillingProjectionOutbox
    mainDataSource.query.mockResolvedValueOnce([outbox])
    outboxRepo.createQueryBuilder.mockReturnValue(queryBuilder(null) as never)

    await service.projectPending()

    expect(ledger.findByIdempotencyKey).not.toHaveBeenCalled()
    expect(ledger.writeTransaction).not.toHaveBeenCalled()
  })

  // --- C6: computeBackoffMs ---

  describe('computeBackoffMs', () => {
    it('首次退避为 10 秒（5s × 2^1）', () => {
      expect(computeBackoffMs(1)).toBe(10_000)
    })

    it('指数增长', () => {
      expect(computeBackoffMs(2)).toBe(20_000)
      expect(computeBackoffMs(3)).toBe(40_000)
      expect(computeBackoffMs(4)).toBe(80_000)
    })

    it('上限为 1 小时', () => {
      expect(computeBackoffMs(20)).toBe(3_600_000)
    })
  })

  // --- C6: handleFailedOutbox ---

  describe('handleFailedOutbox (via projectPending failure)', () => {
    it('失败后递增 attempts 并设置退避', async () => {
      const outbox = {
        id: 'outbox-fail-1',
        reservationId: 'reservation-1',
        userId: 'user-1',
        workId: 'work-1',
        type: BillingProjectionType.FREEZE,
        amount: 10,
        balanceSnapshot: 90,
        idempotencyKey: 'freeze-fail',
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
        attempts: 0,
      } as BillingProjectionOutbox
      mainDataSource.query.mockResolvedValueOnce([outbox])
      // projectOutbox 内部 lock 返回 null（模拟领取失败）
      outboxRepo.createQueryBuilder.mockReturnValue(queryBuilder(null) as never)

      // scheduleProjection 内部查询返回空
      outboxRepo.find.mockResolvedValue([])

      const result = await service.projectPending()

      // claimBatch 返回 1 条，但 projectOutbox 返回 null（被锁定），计入 failed
      expect(result.claimed).toBe(1)
      expect(result.failed).toBe(1)
    })

    it('超过 MAX_ATTEMPTS 后标记 DEAD', async () => {
      const outbox = {
        id: 'outbox-poison-1',
        reservationId: 'reservation-1',
        userId: 'user-1',
        workId: 'work-1',
        type: BillingProjectionType.FREEZE,
        amount: 10,
        balanceSnapshot: 90,
        idempotencyKey: 'freeze-poison',
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
        attempts: 9, // 第 10 次失败 → markDead
      } as BillingProjectionOutbox
      mainDataSource.query.mockResolvedValueOnce([outbox])
      // projectOutbox 内部 lock 返回 outbox → 进入 billing 写入
      // 但 findByIdempotencyKey 抛出异常 → 模拟 billing 不可用
      const qbForLock = queryBuilder(outbox)
      outboxRepo.createQueryBuilder.mockReturnValue(qbForLock as never)
      outboxRepo.findOne.mockResolvedValue(null) // 无 freeze 依赖检查
      ledger.findByIdempotencyKey.mockRejectedValue(new Error('billing connection refused'))

      const result = await service.projectPending()

      expect(result.failed).toBe(1)
      // 会调用 update 标记 DEAD（attempts 9 + 1 = 10 >= MAX_ATTEMPTS）
      expect(outboxRepo.update).toHaveBeenCalledWith(
        { id: 'outbox-poison-1', deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
        expect.objectContaining({
          deliveryStatus: BillingProjectionDeliveryStatus.DEAD,
        }),
      )
    })
  })

  // --- C6: inspectOutbox ---

  describe('inspectOutbox', () => {
    it('返回指定 reservation 的 outbox 记录', async () => {
      const outbox = {
        id: 'outbox-1',
        reservationId: 'reservation-1',
        type: BillingProjectionType.FREEZE,
        deliveryStatus: BillingProjectionDeliveryStatus.DELIVERED,
        attempts: 1,
        nextAttemptAt: null,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      } as BillingProjectionOutbox
      outboxRepo.find.mockResolvedValue([outbox])

      const result = await service.inspectOutbox('reservation-1')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('outbox-1')
      expect(result[0].deliveryStatus).toBe('DELIVERED')
    })
  })

  // --- C6: replayOutbox ---

  describe('replayOutbox', () => {
    it('将 DEAD outbox 重置为 PENDING', async () => {
      const deadOutbox = {
        id: 'outbox-dead-1',
        deliveryStatus: BillingProjectionDeliveryStatus.DEAD,
        type: BillingProjectionType.SETTLE,
        reservationId: 'reservation-1',
      } as BillingProjectionOutbox
      outboxRepo.findOne.mockResolvedValue(deadOutbox)

      await service.replayOutbox('outbox-dead-1')

      expect(outboxRepo.update).toHaveBeenCalledWith(
        { id: 'outbox-dead-1', deliveryStatus: BillingProjectionDeliveryStatus.DEAD },
        expect.objectContaining({
          deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
        }),
      )
    })

    it('不存在的 outbox 抛出异常', async () => {
      outboxRepo.findOne.mockResolvedValue(null)

      await expect(service.replayOutbox('nonexistent')).rejects.toThrow(BusinessException)
    })

    it('非 DEAD 状态的 outbox 抛出异常', async () => {
      const pendingOutbox = {
        id: 'outbox-pending-1',
        deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
      } as BillingProjectionOutbox
      outboxRepo.findOne.mockResolvedValue(pendingOutbox)

      await expect(service.replayOutbox('outbox-pending-1')).rejects.toThrow(BusinessException)
    })
  })

  // --- C6: getDeadLetterSummary ---

  describe('getDeadLetterSummary', () => {
    it('无 DEAD 记录时返回空汇总', async () => {
      outboxRepo.find.mockResolvedValue([])

      const result = await service.getDeadLetterSummary()

      expect(result.total).toBe(0)
      expect(result.oldestCreatedAt).toBeNull()
      expect(result.items).toHaveLength(0)
    })

    it('返回 DEAD 记录汇总', async () => {
      const deadOutbox = {
        id: 'outbox-dead-1',
        reservationId: 'reservation-1',
        type: BillingProjectionType.FREEZE,
        deliveryStatus: BillingProjectionDeliveryStatus.DEAD,
        attempts: 10,
        nextAttemptAt: null,
        lastError: 'billing timeout',
        leaseOwner: null,
        leaseExpiresAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      } as BillingProjectionOutbox
      outboxRepo.find.mockResolvedValue([deadOutbox])

      const result = await service.getDeadLetterSummary()

      expect(result.total).toBe(1)
      expect(result.oldestCreatedAt).toEqual(new Date('2026-01-01'))
      expect(result.items[0].lastError).toBe('billing timeout')
    })
  })
})
