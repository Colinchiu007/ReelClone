/**
 * PackageService 单元测试
 *
 * 覆盖：
 *  - findAll: 仅返回 ACTIVE 状态、按 sort/price 升序
 *  - findOne: 找到 / 不存在抛 NOT_FOUND
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Package,
  PackageStatus,
  PackageType,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException, ErrorCode } from '@reelclone/common';
import { PackageService } from './package.service';

/** 构造 Mock 套餐实体 */
function createMockPackage(overrides: Partial<Package> = {}): Package {
  return {
    id: 'pkg-001',
    name: '9.9 体验套餐',
    description: '体验套餐',
    price: 9.9,
    originalPrice: 19.9,
    points: 100,
    bonusPoints: 20,
    duration: 30,
    features: ['功能1', '功能2'],
    type: PackageType.ONE_TIME,
    status: PackageStatus.ACTIVE,
    sort: 0,
    createdAt: new Date('2025-01-01'),
    userPackages: [],
    orders: [],
    ...overrides,
  } as Package;
}

describe('PackageService', () => {
  let service: PackageService;
  let repo: jest.Mocked<Repository<Package>>;

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Package>>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        PackageService,
        {
          provide: getRepositoryToken(Package, DATABASE_CONNECTIONS.MAIN),
          useValue: repo,
        },
      ],
    }).compile();

    service = moduleRef.get(PackageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('仅返回 ACTIVE 状态的套餐，按 sort ASC、price ASC 排序', async () => {
      const mockList = [
        createMockPackage({ id: 'pkg-1', price: 9.9, sort: 0 }),
        createMockPackage({ id: 'pkg-2', price: 19.9, sort: 1 }),
      ];
      repo.find.mockResolvedValue(mockList);

      const result = await service.findAll();

      expect(result).toEqual(mockList);
      expect(repo.find).toHaveBeenCalledWith({
        where: { status: PackageStatus.ACTIVE },
        order: { sort: 'ASC', price: 'ASC' },
      });
    });

    it('无 ACTIVE 套餐时返回空数组', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(repo.find).toHaveBeenCalled();
    });
  });

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('套餐存在时返回详情', async () => {
      const mockPackage = createMockPackage({ id: 'found-1' });
      repo.findOne.mockResolvedValue(mockPackage);

      const result = await service.findOne('found-1');

      expect(result).toBe(mockPackage);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'found-1' } });
    });

    it('套餐不存在时抛出 NOT_FOUND 异常', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-exist')).rejects.toThrow(
        BusinessException,
      );

      try {
        await service.findOne('not-exist');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
        expect((e as BusinessException).message).toContain('套餐');
      }
    });
  });
});
