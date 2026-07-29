/**
 * AssetService 单元测试
 *
 * 测试范围：
 * - createUploadToken : 签发 STS 凭证并生成 OSS Key
 * - findAll           : 分页 / 筛选（type / keyword / avatarGroupId）
 * - create            : 普通创建 / 关联形象组递增 assetCount / 形象组不存在
 * - findOne           : 成功 / 不存在或无权限
 * - delete            : 成功（含 assetCount 递减）/ 无权限 / OSS 删除失败容错
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
import { OSSService, STSService } from '@reelclone/oss';
import { AssetService } from './asset.service';
import { CreateAssetDto, UploadTokenDto } from './dto/create-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

// -------------------- Mock 工厂 --------------------

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    userId: 'user-1',
    type: AssetType.IMAGE,
    name: 'test.png',
    ossKey: 'assets/image/user-1/uuid.png',
    ossUrl: null,
    mimeType: 'image/png',
    size: 1024,
    duration: null,
    thumbnailKey: null,
    avatarGroupId: null,
    status: AssetStatus.ACTIVE,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  } as Asset;
}

function createAvatarGroup(overrides: Partial<AvatarGroup> = {}): AvatarGroup {
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

function createAssetQbMock(): jest.Mocked<SelectQueryBuilder<Asset>> {
  const qb: Record<string, jest.Mock> = {};
  qb.andWhere = jest.fn().mockReturnThis();
  qb.orderBy = jest.fn().mockReturnThis();
  qb.skip = jest.fn().mockReturnThis();
  qb.take = jest.fn().mockReturnThis();
  qb.getManyAndCount = jest.fn();
  return qb as unknown as jest.Mocked<SelectQueryBuilder<Asset>>;
}

// -------------------- 测试 --------------------

describe('AssetService', () => {
  let service: AssetService;
  let assetRepo: jest.Mocked<Repository<Asset>>;
  let avatarGroupRepo: jest.Mocked<Repository<AvatarGroup>>;
  let stsService: jest.Mocked<STSService>;
  let ossService: jest.Mocked<OSSService>;
  let qb: jest.Mocked<SelectQueryBuilder<Asset>>;

  beforeEach(async () => {
    qb = createAssetQbMock();

    assetRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
      create: jest.fn((entity) => ({ ...entity }) as Asset),
      save: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<Repository<Asset>>;

    avatarGroupRepo = {
      findOne: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<AvatarGroup>>;

    stsService = {
      generateUploadToken: jest.fn(),
    } as unknown as jest.Mocked<STSService>;

    ossService = {
      delete: jest.fn(),
    } as unknown as jest.Mocked<OSSService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetService,
        {
          provide: getRepositoryToken(Asset, DATABASE_CONNECTIONS.MAIN),
          useValue: assetRepo,
        },
        {
          provide: getRepositoryToken(AvatarGroup, DATABASE_CONNECTIONS.MAIN),
          useValue: avatarGroupRepo,
        },
        { provide: STSService, useValue: stsService },
        { provide: OSSService, useValue: ossService },
      ],
    }).compile();

    service = module.get<AssetService>(AssetService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- createUploadToken --------------------

  describe('createUploadToken', () => {
    it('应签发 STS 上传凭证并生成 OSS Key', async () => {
      const stsToken = {
        accessKeyId: 'ak',
        accessKeySecret: 'sk',
        securityToken: 'st',
        expiration: '2025-12-31T23:59:59Z',
        bucket: 'b',
        region: 'r',
        host: 'https://b.r.aliyuncs.com',
      };
      stsService.generateUploadToken.mockResolvedValue({
        stsToken,
        policy: 'policy-base64',
        signature: 'sig',
        uploadHost: 'https://b.r.aliyuncs.com',
        key: undefined,
        expireSeconds: 3600,
      });

      const dto: UploadTokenDto = { fileType: 'image', fileName: 'test.png' };
      const result = await service.createUploadToken('user-1', dto);

      expect(result.key).toMatch(/^assets\/image\/user-1\/.+\.png$/);
      expect(result.uploadHost).toBe('https://b.r.aliyuncs.com');
      expect(result.stsToken).toEqual(stsToken);
      expect(result.policy).toBe('policy-base64');
      expect(result.signature).toBe('sig');
      expect(result.expireSeconds).toBe(3600);
      expect(result.expireAt).toBe('2025-12-31T23:59:59Z');
      expect(stsService.generateUploadToken).toHaveBeenCalledWith(
        'user-1',
        'assets/image/user-1',
        3600,
        expect.stringMatching(/^assets\/image\/user-1\//),
      );
    });

    it('视频类型应生成 video 前缀的 Key', async () => {
      const stsToken = {
        accessKeyId: 'ak',
        accessKeySecret: 'sk',
        securityToken: 'st',
        expiration: '2025-12-31T23:59:59Z',
        bucket: 'b',
        region: 'r',
        host: 'https://b.r.aliyuncs.com',
      };
      stsService.generateUploadToken.mockResolvedValue({
        stsToken,
        policy: 'p',
        signature: 's',
        uploadHost: 'https://b.r.aliyuncs.com',
        key: undefined,
        expireSeconds: 3600,
      });

      const dto: UploadTokenDto = { fileType: 'video', fileName: 'clip.mp4' };
      const result = await service.createUploadToken('user-1', dto);

      expect(result.key).toMatch(/^assets\/video\/user-1\/.+\.mp4$/);
      expect(stsService.generateUploadToken).toHaveBeenCalledWith(
        'user-1',
        'assets/video/user-1',
        3600,
        expect.any(String),
      );
    });
  });

  // -------------------- findAll --------------------

  describe('findAll', () => {
    it('应返回分页列表并应用所有权过滤', async () => {
      const assets = [
        createAsset({ id: 'a1' }),
        createAsset({ id: 'a2' }),
      ];
      qb.getManyAndCount.mockResolvedValue([assets, 2]);

      const dto: ListAssetsDto = { page: 1, pageSize: 20 };
      const result = await service.findAll('user-1', dto);

      expect(result).toEqual({
        list: assets,
        page: 1,
        pageSize: 20,
        total: 2,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.userId = :userId', {
        userId: 'user-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.status = :status', {
        status: AssetStatus.ACTIVE,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('a.createdAt', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('应应用 type / keyword / avatarGroupId 筛选与分页', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);

      const dto: ListAssetsDto = {
        page: 2,
        pageSize: 5,
        type: AssetType.VIDEO,
        keyword: 'demo',
        avatarGroupId: 'group-1',
      };
      await service.findAll('user-1', dto);

      expect(qb.andWhere).toHaveBeenCalledWith('a.type = :type', {
        type: AssetType.VIDEO,
      });
      expect(qb.andWhere).toHaveBeenCalledWith('a.name ILIKE :keyword', {
        keyword: '%demo%',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'a.avatarGroupId = :avatarGroupId',
        { avatarGroupId: 'group-1' },
      );
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
    });
  });

  // -------------------- create --------------------

  describe('create', () => {
    it('应创建资产记录（无形象组，不递增 assetCount）', async () => {
      assetRepo.create.mockImplementation(
        (entity) => ({ ...entity, id: 'asset-new' }) as Asset,
      );
      assetRepo.save.mockResolvedValue(createAsset({ id: 'asset-new' }));

      const dto: CreateAssetDto = {
        ossKey: 'assets/image/user-1/x.png',
        name: 'x.png',
        type: AssetType.IMAGE,
        size: 100,
      };
      const result = await service.create('user-1', dto);

      expect(result.id).toBe('asset-new');
      expect(assetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          ossKey: 'assets/image/user-1/x.png',
          type: AssetType.IMAGE,
          status: AssetStatus.ACTIVE,
          avatarGroupId: null,
        }),
      );
      expect(avatarGroupRepo.increment).not.toHaveBeenCalled();
    });

    it('指定形象组时应校验归属并递增 assetCount', async () => {
      const group = createAvatarGroup({ id: 'group-1', userId: 'user-1' });
      avatarGroupRepo.findOne.mockResolvedValue(group);
      assetRepo.create.mockImplementation(
        (entity) => ({ ...entity, id: 'asset-new' }) as Asset,
      );
      assetRepo.save.mockResolvedValue(
        createAsset({ id: 'asset-new', avatarGroupId: 'group-1' }),
      );

      const dto: CreateAssetDto = {
        ossKey: 'k',
        name: 'n',
        type: AssetType.IMAGE,
        size: 1,
        avatarGroupId: 'group-1',
      };
      await service.create('user-1', dto);

      expect(avatarGroupRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'group-1',
          userId: 'user-1',
          status: AvatarGroupStatus.ACTIVE,
        },
      });
      expect(avatarGroupRepo.increment).toHaveBeenCalledWith(
        { id: 'group-1' },
        'assetCount',
        1,
      );
    });

    it('形象组不存在或无权限时抛出 NOT_FOUND', async () => {
      avatarGroupRepo.findOne.mockResolvedValue(null);

      const dto: CreateAssetDto = {
        ossKey: 'k',
        name: 'n',
        type: AssetType.IMAGE,
        size: 1,
        avatarGroupId: 'group-x',
      };
      await expect(service.create('user-1', dto)).rejects.toThrow(
        BusinessException,
      );
      try {
        await service.create('user-1', dto);
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  // -------------------- findOne --------------------

  describe('findOne', () => {
    it('应返回资产详情', async () => {
      const asset = createAsset({ id: 'asset-1', userId: 'user-1' });
      assetRepo.findOne.mockResolvedValue(asset);

      const result = await service.findOne('user-1', 'asset-1');

      expect(result.id).toBe('asset-1');
      expect(assetRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'asset-1', userId: 'user-1', status: AssetStatus.ACTIVE },
      });
    });

    it('资产不存在或无权限时抛出 NOT_FOUND', async () => {
      assetRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'asset-other')).rejects.toThrow(
        BusinessException,
      );
      try {
        await service.findOne('user-1', 'asset-other');
      } catch (e) {
        expect((e as BusinessException).code).toBe(ErrorCode.NOT_FOUND);
      }
    });
  });

  // -------------------- delete --------------------

  describe('delete', () => {
    it('应删除 OSS 文件 + 数据库记录并递减形象组 assetCount', async () => {
      const asset = createAsset({
        id: 'asset-1',
        userId: 'user-1',
        avatarGroupId: 'group-1',
      });
      assetRepo.findOne.mockResolvedValue(asset);
      ossService.delete.mockResolvedValue(true);
      avatarGroupRepo.findOne.mockResolvedValue(
        createAvatarGroup({ id: 'group-1', assetCount: 1 }),
      );

      const result = await service.delete('user-1', 'asset-1');

      expect(result.success).toBe(true);
      expect(ossService.delete).toHaveBeenCalledWith(asset.ossKey);
      expect(assetRepo.remove).toHaveBeenCalledWith(asset);
      expect(avatarGroupRepo.update).toHaveBeenCalledWith(
        { id: 'group-1' },
        { assetCount: 0 },
      );
    });

    it('资产不存在或无权限时抛出 NOT_FOUND', async () => {
      assetRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('user-1', 'asset-x')).rejects.toThrow(
        BusinessException,
      );
    });

    it('OSS 删除失败时应容错并继续删除数据库记录', async () => {
      const asset = createAsset({ id: 'asset-1', userId: 'user-1' });
      assetRepo.findOne.mockResolvedValue(asset);
      ossService.delete.mockResolvedValue(false);

      const result = await service.delete('user-1', 'asset-1');

      expect(result.success).toBe(true);
      expect(ossService.delete).toHaveBeenCalledWith(asset.ossKey);
      expect(assetRepo.remove).toHaveBeenCalledWith(asset);
    });
  });
});
