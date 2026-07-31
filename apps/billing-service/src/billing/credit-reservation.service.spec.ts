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
import { CreditReservationService } from './credit-reservation.service'
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
    outboxRepo.createQueryBuilder
      .mockReturnValueOnce(queryBuilder([outbox]) as never)
      .mockReturnValueOnce(queryBuilder(outbox) as never)
    outboxRepo.findOne.mockResolvedValue(freeze)
    ledger.findByIdempotencyKey.mockResolvedValue(transaction)

    await service.projectPending()

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
    } as BillingProjectionOutbox
    const freeze = {
      ...terminal,
      id: 'outbox-freeze-1',
      type: BillingProjectionType.FREEZE,
      deliveryStatus: BillingProjectionDeliveryStatus.PENDING,
    } as BillingProjectionOutbox
    outboxRepo.createQueryBuilder
      .mockReturnValueOnce(queryBuilder([terminal]) as never)
      .mockReturnValueOnce(queryBuilder(terminal) as never)
    outboxRepo.findOne.mockResolvedValue(freeze)

    await service.projectPending()

    expect(ledger.findByIdempotencyKey).not.toHaveBeenCalled()
    expect(ledger.writeTransaction).not.toHaveBeenCalled()
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
    } as BillingProjectionOutbox
    outboxRepo.createQueryBuilder
      .mockReturnValueOnce(queryBuilder([outbox]) as never)
      .mockReturnValueOnce(queryBuilder(null) as never)

    await service.projectPending()

    expect(ledger.findByIdempotencyKey).not.toHaveBeenCalled()
    expect(ledger.writeTransaction).not.toHaveBeenCalled()
  })
})
