/**
 * TemplateService 单元测试
 *
 * 测试覆盖:
 *  - 列表查询（默认参数 / 筛选 / 排序 / 分页）
 *  - 详情查询（成功 / 不存在）
 *  - 热门排序验证
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Template,
  TemplateStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException, ErrorCode } from '@reelclone/common';
import { TemplateService } from './template.service';
import { ListTemplatesDto } from './dto/list-templates.dto';

// -------------------- Mock 工具 --------------------

/** 创建 QueryBuilder Mock */
function createQueryBuilderMock(): jest.Mocked<SelectQueryBuilder<Template>> {
  const qb: Record<string, jest.Mock> = {};
  qb.andWhere = jest.fn().mockReturnThis();
  qb.orderBy = jest.fn().mockReturnThis();
  qb.skip = jest.fn().mockReturnThis();
  qb.take = jest.fn().mockReturnThis();
  qb.getManyAndCount = jest.fn();
  return qb as unknown as jest.Mocked<SelectQueryBuilder<Template>>;
}

/** 创建模板 Mock 实体 */
function createMockTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: 'tmpl-001',
    title: '测试模板',
    description: '描述',
    coverKey: 'oss://cover.jpg',
    videoKey: 'oss://video.mp4',
    prompt: '提示词',
    modelConfig: {},
    category: 'category-1',
    industry: '美食',
    platform: 'DOUYIN',
    tags: ['标签1', '标签2'],
    useCount: 100,
    favoriteCount: 50,
    hotScore: 90,
    status: TemplateStatus.ACTIVE,
    createdAt: new Date('2025-01-01'),
    favorites: [],
    ...overrides,
  } as Template;
}

// -------------------- 测试 --------------------

describe('TemplateService', () => {
  let service: TemplateService;
  let repo: jest.Mocked<Repository<Template>>;
  let qb: jest.Mocked<SelectQueryBuilder<Template>>;

  beforeEach(async () => {
    qb = createQueryBuilderMock();
    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Template>>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplateService,
        {
          provide: getRepositoryToken(Template, DATABASE_CONNECTIONS.TEMPLATE),
          useValue: repo,
        },
      ],
    }).compile();

    service = moduleRef.get(TemplateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('默认参数: page=1, pageSize=20, sortBy=heat', async () => {
      const mockList = [createMockTemplate()];
      qb.getManyAndCount.mockResolvedValue([mockList, 1]);

      const result = await service.findAll(new ListTemplatesDto());

      expect(result).toEqual({
        list: mockList,
        page: 1,
        pageSize: 20,
        total: 1,
      });
      // 应过滤 ACTIVE 状态
      expect(qb.andWhere).toHaveBeenCalledWith(
        't.status = :status',
        { status: TemplateStatus.ACTIVE },
      );
      // 应按 hotScore 降序
      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC');
      // 应跳过 0 条，取 20 条
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('分页: page=3, pageSize=10', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.page = 3;
      dto.pageSize = 10;

      await service.findAll(dto);

      // skip = (3-1) * 10 = 20
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('平台筛选: platform=DOUYIN', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.platform = 'DOUYIN';

      await service.findAll(dto);

      expect(qb.andWhere).toHaveBeenCalledWith('t.platform = :platform', {
        platform: 'DOUYIN',
      });
    });

    it('行业筛选: industry=美食', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.industry = '美食';

      await service.findAll(dto);

      expect(qb.andWhere).toHaveBeenCalledWith('t.industry = :industry', {
        industry: '美食',
      });
    });

    it('关键词筛选: keyword=测试', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.keyword = '测试';

      await service.findAll(dto);

      expect(qb.andWhere).toHaveBeenCalledWith('t.title ILIKE :keyword', {
        keyword: '%测试%',
      });
    });

    it('排序: sortBy=latest', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.sortBy = 'latest';

      await service.findAll(dto);

      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
    });

    it('排序: sortBy=iq (回退到 hotScore)', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.sortBy = 'iq';

      await service.findAll(dto);

      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC');
    });

    it('排序: sortBy=heat (默认热度排序)', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto = new ListTemplatesDto();
      dto.sortBy = 'heat';

      await service.findAll(dto);

      expect(qb.orderBy).toHaveBeenCalledWith('t.hotScore', 'DESC');
    });

    it('多条件组合筛选', async () => {
      const mockList = [createMockTemplate({ id: 'combo-1' })];
      qb.getManyAndCount.mockResolvedValue([mockList, 1]);

      const dto = new ListTemplatesDto();
      dto.page = 2;
      dto.pageSize = 5;
      dto.platform = 'XIAOHONGSHU';
      dto.industry = '美妆';
      dto.keyword = '口红';
      dto.sortBy = 'latest';

      const result = await service.findAll(dto);

      expect(result.list).toHaveLength(1);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
      expect(result.total).toBe(1);
      expect(qb.andWhere).toHaveBeenCalledWith('t.platform = :platform', {
        platform: 'XIAOHONGSHU',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t.industry = :industry', {
        industry: '美妆',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('t.title ILIKE :keyword', {
        keyword: '%口红%',
      });
      expect(qb.orderBy).toHaveBeenCalledWith('t.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('模板存在时返回详情', async () => {
      const mockTemplate = createMockTemplate({ id: 'found-1' });
      repo.findOne.mockResolvedValue(mockTemplate);

      const result = await service.findOne('found-1');

      expect(result).toBe(mockTemplate);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'found-1' } });
    });

    it('模板不存在时抛出 NOT_FOUND 异常', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne('not-exist')).rejects.toThrow(
        BusinessException,
      );

      try {
        await service.findOne('not-exist');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
        expect((e as BusinessException).message).toContain('模板');
      }
    });
  });
});
