/**
 * 资产服务
 *
 * 职责：
 * - createUploadToken : 签发 STS Token + 表单上传 Policy / Signature（小程序直传 OSS）
 * - findAll           : 当前用户资产列表（分页 + 筛选，仅 ACTIVE）
 * - create            : 用户直传 OSS 完成后登记资产记录（同步形象组 assetCount）
 * - findOne           : 资产详情（校验所有权）
 * - delete            : 删除 OSS 文件 + 删除数据库记录（校验所有权，OSS 失败容错）
 *
 * OSS Key 生成使用 @reelclone/oss 的 generateAssetKey(userId, fileName, type)。
 * STS 凭证签发使用 @reelclone/oss 的 STSService.generateUploadToken。
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Asset,
  AssetStatus,
  AvatarGroup,
  AvatarGroupStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import {
  OSSService,
  STSService,
  generateAssetKey,
  type STSToken,
} from '@reelclone/oss';
import { BusinessException } from '@reelclone/common';
import { CreateAssetDto, UploadTokenDto } from './dto/create-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** 上传凭证响应 */
export interface UploadTokenResult {
  /** 预生成的对象 Key */
  key: string;
  /** 表单上传目标地址 */
  uploadHost: string;
  /** STS 临时凭证 */
  stsToken: STSToken;
  /** Base64 编码的表单 Policy */
  policy: string;
  /** Policy 签名 */
  signature: string;
  /** 凭证有效期（秒） */
  expireSeconds: number;
  /** 凭证过期时间（ISO 8601） */
  expireAt: string;
}

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    @InjectRepository(Asset, DATABASE_CONNECTIONS.MAIN)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(AvatarGroup, DATABASE_CONNECTIONS.MAIN)
    private readonly avatarGroupRepo: Repository<AvatarGroup>,
    private readonly stsService: STSService,
    private readonly ossService: OSSService,
  ) {}

  /**
   * 签发上传凭证
   * 生成 OSS Key → 调用 STSService.generateUploadToken → 整理响应
   */
  async createUploadToken(
    userId: string,
    dto: UploadTokenDto,
  ): Promise<UploadTokenResult> {
    const key = generateAssetKey(userId, dto.fileName, dto.fileType);
    // 资源前缀用于 STS 权限隔离：仅允许操作 assets/{fileType}/{userId}/ 下的对象
    const resourcePrefix = `assets/${dto.fileType}/${userId}`;
    const token = await this.stsService.generateUploadToken(
      userId,
      resourcePrefix,
      3600,
      key,
    );
    return {
      key,
      uploadHost: token.uploadHost,
      stsToken: token.stsToken,
      policy: token.policy,
      signature: token.signature,
      expireSeconds: token.expireSeconds,
      expireAt: token.stsToken.expiration,
    };
  }

  /**
   * 资产列表（分页 + 筛选，仅当前用户的 ACTIVE 资产）
   */
  async findAll(
    userId: string,
    dto: ListAssetsDto,
  ): Promise<PaginatedResult<Asset>> {
    const { page = 1, pageSize = 20, type, avatarGroupId, keyword } = dto;

    const qb = this.assetRepo.createQueryBuilder('a');
    qb.andWhere('a.userId = :userId', { userId });
    qb.andWhere('a.status = :status', { status: AssetStatus.ACTIVE });

    if (type) {
      qb.andWhere('a.type = :type', { type });
    }
    if (avatarGroupId) {
      qb.andWhere('a.avatarGroupId = :avatarGroupId', { avatarGroupId });
    }
    if (keyword) {
      qb.andWhere('a.name ILIKE :keyword', { keyword: `%${keyword}%` });
    }

    qb.orderBy('a.createdAt', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, page, pageSize, total };
  }

  /**
   * 创建资产记录
   * 若指定 avatarGroupId，校验形象组归属与状态后递增 assetCount
   */
  async create(userId: string, dto: CreateAssetDto): Promise<Asset> {
    // P0-9: 校验 ossKey 前缀，防止跨用户 asset 注入
    // ossKey 必须以 assets/{fileType}/{userId}/ 开头
    const expectedPrefix = `assets/${dto.type.toLowerCase()}/${userId}/`
    if (!dto.ossKey.startsWith(expectedPrefix)) {
      this.logger.warn(
        `ossKey prefix mismatch: expected ${expectedPrefix}, got ${dto.ossKey}`,
      )
      throw new BusinessException({
        code: 'ASSET_INVALID_OSS_KEY',
        message: 'ossKey 前缀不匹配，无权创建资产',
      })
    }

    let avatarGroup: AvatarGroup | null = null;
    if (dto.avatarGroupId) {
      avatarGroup = await this.findOwnedAvatarGroup(userId, dto.avatarGroupId);
    }

    const asset = this.assetRepo.create({
      userId,
      type: dto.type,
      name: dto.name,
      ossKey: dto.ossKey,
      ossUrl: null,
      mimeType: dto.mimeType ?? null,
      size: dto.size,
      duration: dto.duration ?? null,
      thumbnailKey: dto.thumbnailKey ?? null,
      avatarGroupId: avatarGroup ? avatarGroup.id : null,
      status: AssetStatus.ACTIVE,
    });
    const saved = await this.assetRepo.save(asset);

    if (avatarGroup) {
      await this.avatarGroupRepo.increment(
        { id: avatarGroup.id },
        'assetCount',
        1,
      );
    }

    this.logger.log(`User ${userId} created asset ${saved.id}`);
    return saved;
  }

  /**
   * 资产详情（校验所有权 + 仅 ACTIVE）
   */
  async findOne(userId: string, id: string): Promise<Asset> {
    const asset = await this.assetRepo.findOne({
      where: { id, userId, status: AssetStatus.ACTIVE },
    });
    if (!asset) {
      throw BusinessException.notFound('资产');
    }
    return asset;
  }

  /**
   * 删除资产
   * 1. 校验所有权
   * 2. 删除 OSS 文件（失败仅告警，不阻塞数据库删除）
   * 3. 删除数据库记录
   * 4. 若归属形象组，递减 assetCount
   */
  async delete(
    userId: string,
    id: string,
  ): Promise<{ success: boolean }> {
    const asset = await this.findOne(userId, id);

    const ossDeleted = await this.ossService.delete(asset.ossKey);
    if (!ossDeleted) {
      this.logger.warn(
        `OSS 文件删除失败 assetId=${id} ossKey=${asset.ossKey}，继续删除数据库记录`,
      );
    }

    await this.assetRepo.remove(asset);

    if (asset.avatarGroupId) {
      await this.decrementAvatarGroupAssetCount(asset.avatarGroupId);
    }

    this.logger.log(`User ${userId} deleted asset ${id}`);
    return { success: true };
  }

  /**
   * 校验真人形象组归属与状态
   */
  private async findOwnedAvatarGroup(
    userId: string,
    avatarGroupId: string,
  ): Promise<AvatarGroup> {
    const group = await this.avatarGroupRepo.findOne({
      where: { id: avatarGroupId, userId, status: AvatarGroupStatus.ACTIVE },
    });
    if (!group) {
      throw BusinessException.notFound('真人形象组');
    }
    return group;
  }

  /**
   * 递减形象组素材数量（兜底不低于 0）
   */
  private async decrementAvatarGroupAssetCount(
    avatarGroupId: string,
  ): Promise<void> {
    const group = await this.avatarGroupRepo.findOne({
      where: { id: avatarGroupId },
      select: ['id', 'assetCount'],
    });
    if (!group) {
      return;
    }
    const next = Math.max(0, (group.assetCount ?? 0) - 1);
    await this.avatarGroupRepo.update(
      { id: avatarGroupId },
      { assetCount: next },
    );
  }
}
