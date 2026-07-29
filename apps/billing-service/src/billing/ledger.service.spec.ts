/**
 * LedgerService 单元测试
 *
 * 覆盖：
 *  - lockUser：悲观锁 + 用户不存在
 *  - getFrozenBalance：聚合查询
 *  - findByIdempotencyKey / findById
 *  - writeTransaction：流水写入
 *  - freeze：成功 / 余额不足
 *  - settle：成功 / 冻结流水不存在 / 冻结余额不足
 *  - release：成功 / 冻结流水不存在 / 冻结余额不足
 *  - grant：成功 / totalPoints 同步
 *  - consume：成功 / 余额不足
 */
import { BusinessException } from '@reelclone/common';
import {
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database';
import {
  DataSource,
  EntityManager,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import { LedgerService } from './ledger.service';

// -------------------- Mock 工具 --------------------

/** 构造一个模拟 Repository */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  const repo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((entity: unknown) => entity),
    createQueryBuilder: jest.fn(),
  };
  return repo as unknown as jest.Mocked<Repository<T>>;
}

/** 模拟 QueryBuilder 链式调用 */
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
  };
  return qb as unknown as jest.Mocked<unknown>;
}

describe('LedgerService', () => {
  let service: LedgerService;
  let mainDataSource: jest.Mocked<DataSource>;
  let billingDataSource: jest.Mocked<DataSource>;
  let mainUserRepo: jest.Mocked<Repository<User>>;
  let billingTxRepo: jest.Mocked<Repository<PointTransaction>>;
  let txManager: jest.Mocked<EntityManager>;

  beforeEach(() => {
    mainUserRepo = mockRepo<User>();
    billingTxRepo = mockRepo<PointTransaction>();
    txManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === User) return mainUserRepo;
        return billingTxRepo;
      }) as unknown as jest.Mocked<EntityManager>['getRepository'],
    } as unknown as jest.Mocked<EntityManager>;

    mainDataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(txManager),
      ),
      getRepository: jest.fn(() => mainUserRepo),
    } as unknown as jest.Mocked<DataSource>;

    billingDataSource = {
      getRepository: jest.fn(() => billingTxRepo),
    } as unknown as jest.Mocked<DataSource>;

    service = new LedgerService(mainDataSource, billingDataSource);
  });

  // -------------------- lockUser --------------------

  describe('lockUser', () => {
    it('应该返回锁定的用户', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );

      const result = await service.lockUser(txManager, 'u1');
      expect(result).toMatchObject({ id: 'u1', currentPoints: 100 });
      expect(mainUserRepo.createQueryBuilder).toHaveBeenCalledWith('user');
    });

    it('用户不存在时抛 BusinessException', async () => {
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(null) as never,
      );
      await expect(service.lockUser(txManager, 'nope')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // -------------------- getFrozenBalance --------------------

  describe('getFrozenBalance', () => {
    it('应该返回聚合的冻结余额', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '50' }) as never,
      );
      const result = await service.getFrozenBalance('u1');
      expect(result).toBe(50);
    });

    it('无记录时返回 0', async () => {
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: null }) as never,
      );
      const result = await service.getFrozenBalance('u1');
      expect(result).toBe(0);
    });
  });

  // -------------------- findByIdempotencyKey / findById --------------------

  describe('findByIdempotencyKey', () => {
    it('找到时返回流水', async () => {
      const tx: Partial<PointTransaction> = { id: 't1', idempotencyKey: 'k1' };
      billingTxRepo.findOne.mockResolvedValue(tx as PointTransaction);
      const result = await service.findByIdempotencyKey('k1');
      expect(result).toMatchObject({ id: 't1' });
    });

    it('未找到时返回 null', async () => {
      billingTxRepo.findOne.mockResolvedValue(null);
      const result = await service.findByIdempotencyKey('k1');
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('指定 userId 时附加过滤', async () => {
      billingTxRepo.findOne.mockResolvedValue(null);
      await service.findById('t1', 'u1');
      expect(billingTxRepo.findOne).toHaveBeenCalledWith({
        where: { id: 't1', userId: 'u1' },
      });
    });
  });

  // -------------------- writeTransaction --------------------

  describe('writeTransaction', () => {
    it('应该写入流水并返回', async () => {
      const saved: Partial<PointTransaction> = {
        id: 't-new',
        type: PointTransactionType.FREEZE,
      };
      billingTxRepo.save.mockResolvedValue(saved as PointTransaction);

      const result = await service.writeTransaction({
        userId: 'u1',
        type: PointTransactionType.FREEZE,
        amount: -10,
        balanceAfter: 90,
        idempotencyKey: 'k1',
        description: 'freeze 10',
        workId: 'w1',
      });

      expect(result).toMatchObject({ id: 't-new' });
      expect(billingTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          type: PointTransactionType.FREEZE,
          amount: -10,
          balance: 90,
          idempotencyKey: 'k1',
        }),
      );
      expect(billingTxRepo.save).toHaveBeenCalled();
    });
  });

  // -------------------- freeze --------------------

  describe('freeze', () => {
    it('余额充足时应该扣减并写入流水', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );
      mainUserRepo.save.mockResolvedValue(user as User);
      const tx: Partial<PointTransaction> = { id: 'freeze-1', type: PointTransactionType.FREEZE };
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction);
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '10' }) as never,
      );

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k1',
        workId: 'w1',
        description: 'test freeze',
      });

      expect(result.freezeId).toBe('freeze-1');
      expect(result.balance).toBe(90);
      expect(result.frozen).toBe(10);
      // User 应被更新
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPoints: 90 }),
      );
      // 流水应被写入
      expect(billingTxRepo.save).toHaveBeenCalled();
    });

    it('余额不足时抛 BusinessException', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 5, totalPoints: 5 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );

      await expect(
        service.freeze({
          userId: 'u1',
          amount: 10,
          idempotencyKey: 'k1',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  // -------------------- settle --------------------

  describe('settle', () => {
    it('冻结余额充足时写入 SETTLE 流水', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        workId: 'w1',
      };
      const user: Partial<User> = { id: 'u1', currentPoints: 90 };
      billingTxRepo.findOne
        .mockResolvedValueOnce(freezeTx as PointTransaction) // freezeId 查找
        .mockResolvedValueOnce(null); // 其他
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '10' }) as never,
      );
      mainUserRepo.findOne.mockResolvedValue(user as User);
      const tx: Partial<PointTransaction> = { id: 'settle-1', type: PointTransactionType.SETTLE };
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction);

      const result = await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k2',
        freezeId: 'f1',
      });

      expect(result.balance).toBe(90);
      expect(result.tx.id).toBe('settle-1');
    });

    it('FREEZE 流水不存在时抛异常', async () => {
      billingTxRepo.findOne.mockResolvedValue(null);
      await expect(
        service.settle({
          userId: 'u1',
          amount: 10,
          idempotencyKey: 'k2',
          freezeId: 'f-nope',
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('冻结余额不足时抛异常', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
      };
      billingTxRepo.findOne.mockResolvedValueOnce(freezeTx as PointTransaction);
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '5' }) as never,
      );

      await expect(
        service.settle({
          userId: 'u1',
          amount: 10,
          idempotencyKey: 'k2',
          freezeId: 'f1',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  // -------------------- release --------------------

  describe('release', () => {
    it('冻结余额充足时返还可用余额并写入流水', async () => {
      const freezeTx: Partial<PointTransaction> = {
        id: 'f1',
        type: PointTransactionType.FREEZE,
        userId: 'u1',
        workId: 'w1',
      };
      billingTxRepo.findOne.mockResolvedValueOnce(freezeTx as PointTransaction);
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '10' }) as never,
      );
      const user: Partial<User> = { id: 'u1', currentPoints: 90 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );
      mainUserRepo.save.mockResolvedValue(user as User);
      const tx: Partial<PointTransaction> = { id: 'release-1', type: PointTransactionType.RELEASE };
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction);

      const result = await service.release({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k3',
        freezeId: 'f1',
      });

      expect(result.balance).toBe(100);
      expect(result.tx.id).toBe('release-1');
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentPoints: 100 }),
      );
    });

    it('FREEZE 流水不存在时抛异常', async () => {
      billingTxRepo.findOne.mockResolvedValue(null);
      await expect(
        service.release({
          userId: 'u1',
          amount: 10,
          idempotencyKey: 'k3',
          freezeId: 'f-nope',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });

  // -------------------- grant --------------------

  describe('grant', () => {
    it('应该增加 currentPoints 和 totalPoints', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 50, totalPoints: 100 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );
      mainUserRepo.save.mockResolvedValue(user as User);
      const tx: Partial<PointTransaction> = { id: 'grant-1', type: PointTransactionType.GRANT };
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction);
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '0' }) as never,
      );

      const result = await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k4',
        orderId: 'o1',
        packageId: 'p1',
      });

      expect(result.balance).toBe(80);
      expect(mainUserRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPoints: 80,
          totalPoints: 130,
        }),
      );
    });
  });

  // -------------------- consume --------------------

  describe('consume', () => {
    it('余额充足时直接扣减并写入 CONSUME 流水', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 100, totalPoints: 100 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );
      mainUserRepo.save.mockResolvedValue(user as User);
      const tx: Partial<PointTransaction> = { id: 'consume-1', type: PointTransactionType.CONSUME };
      billingTxRepo.save.mockResolvedValue(tx as PointTransaction);
      billingTxRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder({ frozen: '0' }) as never,
      );

      const result = await service.consume({
        userId: 'u1',
        amount: 20,
        idempotencyKey: 'k5',
      });

      expect(result.balance).toBe(80);
      expect(result.tx.id).toBe('consume-1');
    });

    it('余额不足时抛 BusinessException', async () => {
      const user: Partial<User> = { id: 'u1', currentPoints: 5, totalPoints: 5 };
      mainUserRepo.createQueryBuilder.mockReturnValue(
        mockQueryBuilder(user) as never,
      );

      await expect(
        service.consume({
          userId: 'u1',
          amount: 20,
          idempotencyKey: 'k5',
        }),
      ).rejects.toThrow(BusinessException);
    });
  });
});
