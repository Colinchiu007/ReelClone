/**
 * AvatarGroupService 单元测试
 *
 * 测试范围：
 * - create  : 成功 / 同名形象组已存在
 * - findAll : 分页列表
 * - findOne : 成功（含资产）/ 不存在或无权限
 * - update  : 成功（名称变更重新校验唯一性）/ 不存在
 * - delete  : 级联删除组内资产（OSS + DB）并软删除形象组 / 空组 / 不存在
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Asset,
  AssetStatus,
  AssetType,
  AvatarGroup,
  AvatarGroupStatus,
  AuthorizationStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { BusinessException, ErrorCode } from '@reelclone/common';
import { OSSService } from '@reelclone/oss';
import { AvatarGroupService } from './avatar-group.service';
import {
  CreateAvatarGroupDto,
  ListAvatarGroupsDto,
  UpdateAvatarGroupDto,
} from './dto/create-avatar-group.dto';

// -------------------- Mock 工厂 --------------------

function createAvatarGroup(
  overrides: Partial<AvatarGroup> = {},
): AvatarGroup {
  return {
    id: 'group-1',
    userId: 'user-1',
    name: '我的形象组',
    description: null,
    authorizationKey: null,
    authorizationStatus: AuthorizationStatus.PENDING,
    assetCount: 0,
    status: AvatarGroupStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    assets: [],
    ...overrides,
  } as unknown as AvatarGroup;
}

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    userId: 'user-1',
    type: AssetType.IMAGE,
    name: 'a.png',
    ossKey: 'assets/image/user-1/x.png',
    ossUrl: null,
    mimeType: 'image/png',
    size: 100,
    duration: null,
    thumbnailKey: null,
    avatarGroupId: null,
    status: AssetStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Asset;
}

function createGroupQbMock(): jest.Mocked<SelectQueryBuilder<AvatarGroup>> {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnThis();
  qb.andWhere = jest.fn().mockReturnThis();
  qb.orderBy = jest.fn().mockReturnThis();
  qb.skip = jest.fn().mockReturnThis();
  qb.take = jest.fn().mockReturnThis();
  qb.getOne = jest.fn();
  qb.getManyAndCount = jest.fn();
  return qb as unknown as jest.Mocked<SelectQueryBuilder<AvatarGroup>>;
}

// -------------------- 测试 --------------------

describe('AvatarGroupService', () => {
  let service: AvatarGroupService;
  let avatarGroupRepo: jest.Mocked<Repository<AvatarGroup>>;
  let assetRepo: jest.Mocked<Repository<Asset>>;
  let ossService: jest.Mocked<OSSService>;
  let groupQb: jest.Mocked<SelectQueryBuilder<AvatarGroup>>;

  beforeEach(async () => {
    groupQb = createGroupQbMock();

    avatarGroupRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(groupQb),
      findOne: jest.fn(),
      create: jest.fn((entity) => ({ ...entity }) as AvatarGroup),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AvatarGroup>>;

    assetRepo = {
      find: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Asset>>;

    ossService = {
      delete: jest.fn(),
    } as unknown as jest.Mocked<OSSService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarGroupService,
        {
          provide: getRepositoryToken(AvatarGroup, DATABASE_CONNECTIONS.MAIN),
          useValue: avatarGroupRepo,
        },
        {
          provide: getRepositoryToken(Asset, DATABASE_CONNECTIONS.MAIN),
          useValue: assetRepo,
        },
        { provide: OSSService, useValue: ossService },
      ],
    }).compile();

    service = module.get<AvatarGroupService>(AvatarGroupService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- create --------------------

  describe('create', () => {
    it('应创建真人形象组', async () => {
      groupQb.getOne.mockResolvedValue(null);
      avatarGroupRepo.create.mockImplementation(
        (entity) => ({ ...entity, id: 'group-new' }) as AvatarGroup,
      );
      avatarGroupRepo.save.mockResolvedValue(
        createAvatarGroup({ id: 'group-new', name: '新形象组' }),
      );

      const dto: CreateAvatarGroupDto = {
        name: '新形象组',
        description: '描述',
      };
      const result = await service.create('user-1', dto);

      expect(result.id).toBe('group-new');
      expect(avatarGroupRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          name: '新形象组',
          status: AvatarGroupStatus.ACTIVE,
          assetCount: 0,
        }),
      );
      expect(avatarGroupRepo.save).toHaveBeenCalled();
    });

    it('同名形象组已存在时抛出异常', async () => {
      groupQb.getOne.mockResolvedValue(
        createAvatarGroup({ id: 'other-group', name: '已存在' }),
      );

      const dto: CreateAvatarGroupDto = { name: '已存在' };
      await expect(service.create('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
      try {
        await service.create('user-1', dto);
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.VALIDATION_ERROR);
        expect((e as BusinessException).message).toContain('已存在');
      }
    });
  });

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('应返回分页形象组列表（仅当前用户 ACTIVE 组）', async () => {
      const groups = [
        createAvatarGroup({ id: 'g1' }),
        createAvatarGroup({ id: 'g2' }),
      ];
      groupQb.getManyAndCount.mockResolvedValue([groups, 2]);

      const dto: ListAvatarGroupsDto = { page: 1, pageSize: 20 };
      const result = await service.findAll('user-1', dto);

      expect(result).toEqual({
        list: groups,
        page: 1,
        pageSize: 20,
        total: 2,
      });
      expect(groupQb.andWhere).toHaveBeenCalledWith('g.userId = :userId', {
        userId: 'user-1',
      });
      expect(groupQb.andWhere).toHaveBeenCalledWith('g.status = :status', {
        status: AvatarGroupStatus.ACTIVE,
      });
      expect(groupQb.orderBy).toHaveBeenCalledWith('g.createdAt', 'DESC');
      expect(groupQb.skip).toHaveBeenCalledWith(0);
      expect(groupQb.take).toHaveBeenCalledWith(20);
    });

    it('分页 page=2, pageSize=5 → skip=5', async () => {
      groupQb.getManyAndCount.mockResolvedValue([[], 0]);
      const dto: ListAvatarGroupsDto = { page: 2, pageSize: 5 };
      await service.findAll('user-1', dto);
      expect(groupQb.skip).toHaveBeenCalledWith(5);
      expect(groupQb.take).toHaveBeenCalledWith(5);
    });
  });

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('应返回形象组详情（含资产关联）', async () => {
      const group = createAvatarGroup({ id: 'g1' });
      avatarGroupRepo.findOne.mockResolvedValue(group);

      const result = await service.findOne('user-1', 'g1');

      expect(result.id).toBe('g1');
      expect(avatarGroupRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'g1', userId: 'user-1', status: AvatarGroupStatus.ACTIVE },
        relations: ['assets'],
      });
    });

    it('形象组不存在或无权限时抛出 NOT_FOUND', async () => {
      avatarGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'g-x')).rejects.toThrow(
        BusinessException,
      );
      try {
        await service.findOne('user-1', 'g-x');
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  // -------------------- update --------------------

  describe('update', () => {
    it('应更新形象组（名称变更时重新校验唯一性）', async () => {
      const group = createAvatarGroup({ id: 'g1', name: '旧名' });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      groupQb.getOne.mockResolvedValue(null);
      avatarGroupRepo.save.mockImplementation(async (g: any) => g);

      const dto: UpdateAvatarGroupDto = {
        name: '新名',
        description: '新描述',
      };
      const result = await service.update('user-1', 'g1', dto);

      expect(result.name).toBe('新名');
      expect(result.description).toBe('新描述');
      expect(groupQb.andWhere).toHaveBeenCalledWith('g.id != :excludeId', {
        excludeId: 'g1',
      });
      expect(avatarGroupRepo.save).toHaveBeenCalledWith(group);
    });

    it('名称未变更时不重新校验唯一性', async () => {
      const group = createAvatarGroup({ id: 'g1', name: '同名' });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      avatarGroupRepo.save.mockImplementation(async (g: any) => g);

      const dto: UpdateAvatarGroupDto = { description: '仅更新描述' };
      await service.update('user-1', 'g1', dto);

      expect(groupQb.getOne).not.toHaveBeenCalled();
    });

    it('形象组不存在时抛出 NOT_FOUND', async () => {
      avatarGroupRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'g-x', { name: 'x' }),
      ).rejects.toThrow(BusinessException);
    });
  });

  // -------------------- delete --------------------

  describe('delete', () => {
    it('应级联删除组内资产（OSS + DB）并软删除形象组', async () => {
      const group = createAvatarGroup({ id: 'g1', assetCount: 2 });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      const asset1 = createAsset({
        id: 'a1',
        avatarGroupId: 'g1',
        ossKey: 'k1',
      });
      const asset2 = createAsset({
        id: 'a2',
        avatarGroupId: 'g1',
        ossKey: 'k2',
      });
      assetRepo.find.mockResolvedValue([asset1, asset2]);
      ossService.delete.mockResolvedValue(true);
      avatarGroupRepo.save.mockImplementation(async (g: any) => g);

      const result = await service.delete('user-1', 'g1');

      expect(result.success).toBe(true);
      expect(ossService.delete).toHaveBeenCalledWith('k1');
      expect(ossService.delete).toHaveBeenCalledWith('k2');
      expect(assetRepo.remove).toHaveBeenCalledWith([asset1, asset2]);
      expect(group.status).toBe(AvatarGroupStatus.DELETED);
      expect(group.assetCount).toBe(0);
      expect(avatarGroupRepo.save).toHaveBeenCalledWith(group);
    });

    it('空组删除时应跳过资产级联', async () => {
      const group = createAvatarGroup({ id: 'g1', assetCount: 0 });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      assetRepo.find.mockResolvedValue([]);
      avatarGroupRepo.save.mockImplementation(async (g: any) => g);

      const result = await service.delete('user-1', 'g1');

      expect(result.success).toBe(true);
      expect(ossService.delete).not.toHaveBeenCalled();
      expect(assetRepo.remove).not.toHaveBeenCalled();
    });

    it('形象组不存在时抛出 NOT_FOUND', async () => {
      avatarGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('user-1', 'g-x')).rejects.toThrow(
        BusinessException,
      );
    });

    it('OSS 删除失败时应容错并继续删除数据库记录', async () => {
      const group = createAvatarGroup({ id: 'g1', assetCount: 1 });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      const asset1 = createAsset({
        id: 'a1',
        avatarGroupId: 'g1',
        ossKey: 'k1',
      });
      assetRepo.find.mockResolvedValue([asset1]);
      ossService.delete.mockResolvedValue(false);
      avatarGroupRepo.save.mockImplementation(async (g: any) => g);

      const result = await service.delete('user-1', 'g1');

      expect(result.success).toBe(true);
      expect(assetRepo.remove).toHaveBeenCalledWith([asset1]);
      expect(group.status).toBe(AvatarGroupStatus.DELETED);
    });
  });
});
