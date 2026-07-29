/**
 * BillingService 单元测试
 *
 * 覆盖：
 *  - getBalance：缓存命中 / 缓存未命中
 *  - freeze：成功 / 余额不足 / 幂等（重复请求返回首次结果）
 *  - settle：成功
 *  - release：成功
 *  - grant：成功
 *  - listTransactions / getTransaction
 *  - 幂等机制：Redis 锁竞争 + 结果缓存
 */
import { BusinessException } from '@reelclone/common';
import {
  PointTransaction,
  PointTransactionType,
  User,
} from '@reelclone/database';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { BillingService } from './billing.service';
import { LedgerService } from './ledger.service';
import { ListTransactionsDto, TransactionDirection } from './dto/list-transactions.dto';

// -------------------- Mock 工具 --------------------

/** 模拟 Redis 客户端 */
function mockRedis(): Record<string, jest.Mock> {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string, ...rest: unknown[]) => {
      // 支持 'EX', ttl, 'NX' 等参数
      let nx = false;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === 'NX') nx = true;
      }
      if (nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  } as unknown as Record<string, jest.Mock>;
}

/** 模拟 Repository */
function mockRepo<T extends ObjectLiteral>(): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((e: unknown) => e),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

describe('BillingService', () => {
  let service: BillingService;
  let redis: Record<string, jest.Mock>;
  let mainDataSource: jest.Mocked<DataSource>;
  let billingDataSource: jest.Mocked<DataSource>;
  let ledger: jest.Mocked<LedgerService>;
  let userRepo: jest.Mocked<Repository<User>>;
  let txRepo: jest.Mocked<Repository<PointTransaction>>;

  beforeEach(() => {
    redis = mockRedis();
    userRepo = mockRepo<User>();
    txRepo = mockRepo<PointTransaction>();

    mainDataSource = {
      getRepository: jest.fn(() => userRepo),
      transaction: jest.fn(),
    } as unknown as jest.Mocked<DataSource>;

    billingDataSource = {
      getRepository: jest.fn(() => txRepo),
    } as unknown as jest.Mocked<DataSource>;

    ledger = {
      freeze: jest.fn(),
      settle: jest.fn(),
      release: jest.fn(),
      grant: jest.fn(),
      consume: jest.fn(),
      getFrozenBalance: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      lockUser: jest.fn(),
      writeTransaction: jest.fn(),
    } as unknown as jest.Mocked<LedgerService>;

    service = new BillingService(
      redis as never,
      mainDataSource,
      billingDataSource,
      ledger,
    );
  });

  // -------------------- getBalance --------------------

  describe('getBalance', () => {
    it('缓存命中时直接返回缓存值', async () => {
      // 预设缓存
      await redis.set(`points:balance:u1`, '100', 'EX', 60);
      await redis.set(`points:frozen:u1`, '20', 'EX', 60);

      // totalPoints 仍从 DB 查
      const qb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '500' }),
      };
      userRepo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.getBalance('u1');
      expect(result).toEqual({ balance: 100, frozen: 20, total: 500 });
      // 不应该读 user 表的 findOne
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('缓存未命中时查 DB 并回填缓存', async () => {
      const user: Partial<User> = {
        id: 'u1',
        currentPoints: 100,
        totalPoints: 500,
      };
      userRepo.findOne.mockResolvedValue(user as User);
      ledger.getFrozenBalance.mockResolvedValue(20);

      const result = await service.getBalance('u1');
      expect(result).toEqual({ balance: 100, frozen: 20, total: 500 });
      // 缓存应被回填
      expect(redis.set).toHaveBeenCalledWith(
        'points:balance:u1',
        '100',
        'EX',
        60,
      );
      expect(redis.set).toHaveBeenCalledWith(
        'points:frozen:u1',
        '20',
        'EX',
        60,
      );
    });

    it('用户不存在时抛异常', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.getBalance('nope')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // -------------------- listTransactions --------------------

  describe('listTransactions', () => {
    it('应该分页返回流水', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([
            [{ id: 't1' } as PointTransaction],
            1,
          ]),
      };
      txRepo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.listTransactions('u1', new ListTransactionsDto());
      expect(result.list).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.total).toBe(1);
    });

    it('支持 type 与 direction 过滤', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      txRepo.createQueryBuilder.mockReturnValue(qb as never);

      const dto = new ListTransactionsDto();
      dto.type = PointTransactionType.FREEZE;
      dto.direction = TransactionDirection.DEBIT;

      await service.listTransactions('u1', dto);
      // 应该至少调用了 type / amount < 0 的 andWhere
      expect(qb.andWhere).toHaveBeenCalled();
    });
  });

  // -------------------- getTransaction --------------------

  describe('getTransaction', () => {
    it('找到时返回流水', async () => {
      const tx: Partial<PointTransaction> = { id: 't1', userId: 'u1' };
      ledger.findById.mockResolvedValue(tx as PointTransaction);
      const result = await service.getTransaction('u1', 't1');
      expect(result.id).toBe('t1');
    });

    it('未找到时抛异常', async () => {
      ledger.findById.mockResolvedValue(null);
      await expect(service.getTransaction('u1', 'nope')).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // -------------------- freeze --------------------

  describe('freeze', () => {
    it('成功时调用 LedgerService.freeze 并失效缓存', async () => {
      ledger.freeze.mockResolvedValue({
        freezeId: 'f1',
        balance: 90,
        frozen: 10,
        tx: { id: 'f1' } as PointTransaction,
      });
      ledger.findByIdempotencyKey.mockResolvedValue(null);

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k1',
        workId: 'w1',
      });

      expect(result.success).toBe(true);
      expect(result.balance).toBe(90);
      expect(result.transactionId).toBe('f1');
      // 缓存应被失效
      expect(redis.del).toHaveBeenCalledWith('points:balance:u1');
      expect(redis.del).toHaveBeenCalledWith('points:frozen:u1');
    });

    it('余额不足时抛异常（来自 LedgerService）', async () => {
      ledger.findByIdempotencyKey.mockResolvedValue(null);
      ledger.freeze.mockRejectedValue(
        BusinessException.insufficientCredits('not enough'),
      );

      await expect(
        service.freeze({
          userId: 'u1',
          amount: 1000,
          idempotencyKey: 'k1',
        }),
      ).rejects.toThrow(BusinessException);
    });

    it('幂等：重复请求返回首次结果', async () => {
      // 首次调用：执行成功
      ledger.freeze.mockResolvedValue({
        freezeId: 'f1',
        balance: 90,
        frozen: 10,
        tx: { id: 'f1' } as PointTransaction,
      });
      ledger.findByIdempotencyKey.mockResolvedValue(null);

      const first = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-dup',
      });
      expect(first.transactionId).toBe('f1');

      // 第二次调用：不应再调用 ledger.freeze
      ledger.freeze.mockClear();
      const second = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-dup',
      });
      expect(second.transactionId).toBe('f1');
      expect(ledger.freeze).not.toHaveBeenCalled();
    });
  });

  // -------------------- settle --------------------

  describe('settle', () => {
    it('成功时调用 LedgerService.settle', async () => {
      ledger.settle.mockResolvedValue({
        balance: 90,
        frozen: 0,
        tx: { id: 's1' } as PointTransaction,
      });
      ledger.findByIdempotencyKey.mockResolvedValue(null);

      const result = await service.settle({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k2',
        freezeId: 'f1',
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('s1');
      expect(ledger.settle).toHaveBeenCalled();
    });
  });

  // -------------------- release --------------------

  describe('release', () => {
    it('成功时调用 LedgerService.release', async () => {
      ledger.release.mockResolvedValue({
        balance: 100,
        frozen: 0,
        tx: { id: 'r1' } as PointTransaction,
      });
      ledger.findByIdempotencyKey.mockResolvedValue(null);

      const result = await service.release({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k3',
        freezeId: 'f1',
      });

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('r1');
      expect(ledger.release).toHaveBeenCalled();
    });
  });

  // -------------------- grant --------------------

  describe('grant', () => {
    it('成功时调用 LedgerService.grant', async () => {
      ledger.grant.mockResolvedValue({
        balance: 130,
        frozen: 0,
        tx: { id: 'g1' } as PointTransaction,
      });
      ledger.findByIdempotencyKey.mockResolvedValue(null);

      const result = await service.grant({
        userId: 'u1',
        amount: 30,
        idempotencyKey: 'k4',
        orderId: 'o1',
        packageId: 'p1',
      });

      expect(result.success).toBe(true);
      expect(result.balance).toBe(130);
      expect(ledger.grant).toHaveBeenCalled();
    });
  });

  // -------------------- 幂等：DB 中已存在流水 --------------------

  describe('幂等机制 - DB 双重检查', () => {
    it('DB 中已有同 idempotencyKey 流水时直接返回，不执行业务', async () => {
      const existing: Partial<PointTransaction> = {
        id: 'old-tx',
        amount: -10,
        balance: 90,
        type: PointTransactionType.FREEZE,
      };
      ledger.findByIdempotencyKey.mockResolvedValue(existing as PointTransaction);

      const result = await service.freeze({
        userId: 'u1',
        amount: 10,
        idempotencyKey: 'k-existing',
      });

      expect(result.transactionId).toBe('old-tx');
      expect(ledger.freeze).not.toHaveBeenCalled();
    });
  });
});
