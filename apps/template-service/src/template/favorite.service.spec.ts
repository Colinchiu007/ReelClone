/**
 * FavoriteService 单元测试
 *
 * 测试覆盖:
 *  - 收藏模板（新收藏 / 幂等性 / 模板不存在）
 *  - 取消收藏（成功 / 幂等性）
 *  - 我的收藏列表（分页 / join 查询）
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Template,
  Favorite,
  TemplateStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException, ErrorCode } from '@reelclone/common';
import { FavoriteService } from './favorite.service';

// -------------------- Mock 工具 --------------------

/** 创建 Favorite QueryBuilder Mock */
function createFavoriteQueryBuilderMock(): jest.Mocked<
  SelectQueryBuilder<Favorite>
> {
  const qb: Record<string, jest.Mock> = {};
  qb.innerJoinAndSelect = jest.fn().mockReturnThis();
  qb.where = jest.fn().mockReturnThis();
  qb.orderBy = jest.fn().mockReturnThis();
  qb.skip = jest.fn().mockReturnThis();
  qb.take = jest.fn().mockReturnThis();
  qb.getManyAndCount = jest.fn();
  return qb as unknown as jest.Mocked<SelectQueryBuilder<Favorite>>;
}

/** 创建模板 Mock */
function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    title: '测试模板',
    description: null,
    coverKey: 'oss://cover.jpg',
    videoKey: null,
    prompt: null,
    modelConfig: {},
    category: null,
    industry: '美食',
    platform: 'DOUYIN',
    tags: [],
    useCount: 0,
    favoriteCount: 0,
    hotScore: 0,
    status: TemplateStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    favorites: [],
    ...overrides,
  } as Template;
}

/** 创建收藏 Mock */
function createMockFavorite(
  overrides: Partial<Favorite> = {},
): Favorite {
  return {
    id: 'fav-001',
    userId: 'user-001',
    templateId: 'tmpl-001',
    createdAt: new Date('2025-01-02'),
    template: createMockTemplate(),
    ...overrides,
  } as Favorite;
}

// -------------------- 测试 --------------------

describe('FavoriteService', () => {
  let service: FavoriteService;
  let favoriteRepo: jest.Mocked<Repository<Favorite>>;
  let templateRepo: jest.Mocked<Repository<Template>>;
  let favQb: jest.Mocked<SelectQueryBuilder<Favorite>>;

  beforeEach(async () => {
    favQb = createFavoriteQueryBuilderMock();

    favoriteRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(favQb),
      findOne: jest.fn(),
      create: jest.fn((entity) => entity as Favorite),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Favorite>>;

    templateRepo = {
      findOne: jest.fn(),
      increment: jest.fn(),
      decrement: jest.fn(),
    } as unknown as jest.Mocked<Repository<Template>>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        FavoriteService,
        {
          provide: getRepositoryToken(Favorite, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: favoriteRepo,
        },
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: templateRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(FavoriteService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- favorite --------------------

  describe('favorite', () => {
    it('新收藏: 创建记录并递增 favoriteCount', async () => {
      const template = createMockTemplate({ id: 'tmpl-001' });
      templateRepo.findOne.mockResolvedValue(template);
      favoriteRepo.findOne.mockResolvedValue(null);

      const result = await service.favorite('user-001', 'tmpl-001');

      expect(result).toEqual({ favorited: true });
      expect(favoriteRepo.create).toHaveBeenCalledWith({
        userId: 'user-001',
        templateId: 'tmpl-001',
      });
      expect(favoriteRepo.save).toHaveBeenCalled();
      expect(templateRepo.increment).toHaveBeenCalledWith(
        { id: 'tmpl-001' },
        'favoriteCount',
        1,
      );
    });

    it('幂等性: 已收藏不重复创建', async () => {
      const template = createMockTemplate({ id: 'tmpl-001' });
      const existingFav = createMockFavorite();
      templateRepo.findOne.mockResolvedValue(template);
      favoriteRepo.findOne.mockResolvedValue(existingFav);

      const result = await service.favorite('user-001', 'tmpl-001');

      expect(result).toEqual({ favorited: true });
      // 不应调用 create / save / increment
      expect(favoriteRepo.create).not.toHaveBeenCalled();
      expect(favoriteRepo.save).not.toHaveBeenCalled();
      expect(templateRepo.increment).not.toHaveBeenCalled();
    });

    it('模板不存在时抛出 NOT_FOUND', async () => {
      templateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.favorite('user-001', 'not-exist'),
      ).rejects.toThrow(BusinessException);

      try {
        await service.favorite('user-001', 'not-exist');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  // -------------------- unfavorite --------------------

  describe('unfavorite', () => {
    it('成功取消收藏: 删除记录并递减 favoriteCount', async () => {
      const existingFav = createMockFavorite();
      favoriteRepo.findOne.mockResolvedValue(existingFav);

      const result = await service.unfavorite('user-001', 'tmpl-001');

      expect(result).toEqual({ favorited: false });
      expect(favoriteRepo.remove).toHaveBeenCalledWith(existingFav);
      expect(templateRepo.decrement).toHaveBeenCalledWith(
        { id: 'tmpl-001' },
        'favoriteCount',
        1,
      );
    });

    it('幂等性: 未收藏时不报错', async () => {
      favoriteRepo.findOne.mockResolvedValue(null);

      const result = await service.unfavorite('user-001', 'tmpl-001');

      expect(result).toEqual({ favorited: false });
      expect(favoriteRepo.remove).not.toHaveBeenCalled();
      expect(templateRepo.decrement).not.toHaveBeenCalled();
    });
  });

  // -------------------- findMyFavorites --------------------

  describe('findMyFavorites', () => {
    it('返回分页收藏列表（含模板信息）', async () => {
      const template1 = createMockTemplate({ id: 't1', title: '模板1' });
      const template2 = createMockTemplate({ id: 't2', title: '模板2' });
      const favorites = [
        createMockFavorite({
          id: 'fav-1',
          templateId: 't1',
          template: template1,
          createdAt: new Date('2025-01-03'),
        }),
        createMockFavorite({
          id: 'fav-2',
          templateId: 't2',
          template: template2,
          createdAt: new Date('2025-01-02'),
        }),
      ];
      favQb.getManyAndCount.mockResolvedValue([favorites, 2]);

      const result = await service.findMyFavorites('user-001', 1, 20);

      expect(result).toEqual({
        list: [template1, template2],
        page: 1,
        pageSize: 20,
        total: 2,
      });
      expect(favQb.innerJoinAndSelect).toHaveBeenCalledWith('f.template', 't');
      expect(favQb.where).toHaveBeenCalledWith('f.userId = :userId', {
        userId: 'user-001',
      });
      expect(favQb.orderBy).toHaveBeenCalledWith('f.createdAt', 'DESC');
      expect(favQb.skip).toHaveBeenCalledWith(0);
      expect(favQb.take).toHaveBeenCalledWith(20);
    });

    it('分页: page=2, pageSize=5', async () => {
      favQb.getManyAndCount.mockResolvedValue([[], 0]);

      await service.findMyFavorites('user-001', 2, 5);

      // skip = (2-1) * 5 = 5
      expect(favQb.skip).toHaveBeenCalledWith(5);
      expect(favQb.take).toHaveBeenCalledWith(5);
    });

    it('空收藏列表', async () => {
      favQb.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findMyFavorites('user-001', 1, 20);

      expect(result.list).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
