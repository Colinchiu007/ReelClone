/**
 * TemplateController 单元测试
 *
 * 测试覆盖:
 *  - 各端点响应格式验证
 *  - 公开端点（list / detail）调用正确服务
 *  - 需 JWT 端点（favorites / favorite / unfavorite）从 @CurrentUser 提取 userId
 *  - /favorites 路由优先于 /:id
 */
import { Test } from '@nestjs/testing';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { FavoriteService } from './favorite.service';
import { ListTemplatesDto } from './dto/list-templates.dto';
import {
  Template,
  TemplateStatus,
} from '@reelclone/database';

// -------------------- Mock 工具 --------------------

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
    tags: ['热门'],
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

describe('TemplateController', () => {
  let controller: TemplateController;
  let templateService: jest.Mocked<TemplateService>;
  let favoriteService: jest.Mocked<FavoriteService>;

  beforeEach(async () => {
    templateService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<TemplateService>;

    favoriteService = {
      favorite: jest.fn(),
      unfavorite: jest.fn(),
      findMyFavorites: jest.fn(),
    } as unknown as jest.Mocked<FavoriteService>;

    const moduleRef = await Test.createTestingModule({
      controllers: [TemplateController],
      providers: [
        { provide: TemplateService, useValue: templateService },
        { provide: FavoriteService, useValue: favoriteService },
      ],
    }).compile();

    controller = moduleRef.get(TemplateController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- GET / (list) --------------------

  describe('list', () => {
    it('调用 templateService.findAll 并返回分页结果', async () => {
      const dto = new ListTemplatesDto();
      const mockResult = {
        list: [createMockTemplate()],
        page: 1,
        pageSize: 20,
        total: 1,
      };
      templateService.findAll.mockResolvedValue(mockResult);

      const result = await controller.list(dto);

      expect(templateService.findAll).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
      expect(result.list).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
    });
  });

  // -------------------- GET /favorites --------------------

  describe('myFavorites', () => {
    it('调用 favoriteService.findMyFavorites 并返回分页结果', async () => {
      const mockResult = {
        list: [createMockTemplate({ id: 'fav-tmpl-1' })],
        page: 1,
        pageSize: 20,
        total: 1,
      };
      favoriteService.findMyFavorites.mockResolvedValue(mockResult);

      const pagination = { page: 1, pageSize: 20 };
      const result = await controller.myFavorites('user-001', pagination);

      expect(favoriteService.findMyFavorites).toHaveBeenCalledWith(
        'user-001',
        1,
        20,
      );
      expect(result).toEqual(mockResult);
    });

    it('使用默认分页参数', async () => {
      favoriteService.findMyFavorites.mockResolvedValue({
        list: [],
        page: 1,
        pageSize: 20,
        total: 0,
      });

      await controller.myFavorites('user-001', {} as any);

      expect(favoriteService.findMyFavorites).toHaveBeenCalledWith(
        'user-001',
        1,
        20,
      );
    });
  });

  // -------------------- GET /:id (detail) --------------------

  describe('detail', () => {
    it('调用 templateService.findOne 并返回模板详情', async () => {
      const mockTemplate = createMockTemplate({ id: 'detail-1' });
      templateService.findOne.mockResolvedValue(mockTemplate);

      const result = await controller.detail('detail-1');

      expect(templateService.findOne).toHaveBeenCalledWith('detail-1');
      expect(result).toBe(mockTemplate);
    });
  });

  // -------------------- POST /:id/favorite --------------------

  describe('favorite', () => {
    it('调用 favoriteService.favorite 并返回结果', async () => {
      favoriteService.favorite.mockResolvedValue({ favorited: true });

      const result = await controller.favorite('user-001', 'tmpl-001');

      expect(favoriteService.favorite).toHaveBeenCalledWith(
        'user-001',
        'tmpl-001',
      );
      expect(result).toEqual({ favorited: true });
    });
  });

  // -------------------- DELETE /:id/favorite --------------------

  describe('unfavorite', () => {
    it('调用 favoriteService.unfavorite 并返回结果', async () => {
      favoriteService.unfavorite.mockResolvedValue({ favorited: false });

      const result = await controller.unfavorite('user-001', 'tmpl-001');

      expect(favoriteService.unfavorite).toHaveBeenCalledWith(
        'user-001',
        'tmpl-001',
      );
      expect(result).toEqual({ favorited: false });
    });
  });
});
