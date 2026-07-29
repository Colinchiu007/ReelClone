/**
 * 真人形象组服务
 *
 * 职责：
 * - create  : 创建形象组（同用户下名称唯一）
 * - findAll : 当前用户形象组列表（分页，仅 ACTIVE）
 * - findOne : 详情（含组内资产列表，校验所有权）
 * - update  : 更新（名称变更重新校验唯一性）
 * - delete  : 级联删除组内所有资产（OSS + DB）后软删除形象组
 *
 * 资产为硬删除（OSS + 数据库记录），形象组为软删除（status=DELETED，列表已过滤）。
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  Asset,
  AssetStatus,
  AvatarGroup,
  AvatarGroupStatus,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { OSSService } from '@reelclone/oss'
import { BusinessException, ErrorCode } from '@reelclone/common'
import {
  CreateAvatarGroupDto,
  ListAvatarGroupsDto,
  UpdateAvatarGroupDto,
} from './dto/create-avatar-group.dto'
import type { PaginatedResult } from './asset.service'

@Injectable()
export class AvatarGroupService {
  private readonly logger = new Logger(AvatarGroupService.name)

  constructor(
    @InjectRepository(AvatarGroup, DATABASE_CONNECTIONS.MAIN)
    private readonly avatarGroupRepo: Repository<AvatarGroup>,
    @InjectRepository(Asset, DATABASE_CONNECTIONS.MAIN)
    private readonly assetRepo: Repository<Asset>,
    private readonly ossService: OSSService,
  ) {}

  /**
   * 创建真人形象组
   * @throws BusinessException 同名形象组已存在
   */
  async create(userId: string, dto: CreateAvatarGroupDto): Promise<AvatarGroup> {
    await this.ensureNameUnique(userId, dto.name)

    const group = this.avatarGroupRepo.create({
      userId,
      name: dto.name,
      description: dto.description ?? null,
      authorizationKey: dto.authorizationKey ?? null,
      assetCount: 0,
      status: AvatarGroupStatus.ACTIVE,
    })
    const saved = await this.avatarGroupRepo.save(group)
    this.logger.log(`User ${userId} created avatar group ${saved.id}`)
    return saved
  }

  /**
   * 形象组列表（分页，仅当前用户的 ACTIVE 组）
   */
  async findAll(userId: string, dto: ListAvatarGroupsDto): Promise<PaginatedResult<AvatarGroup>> {
    const { page = 1, pageSize = 20 } = dto

    const qb = this.avatarGroupRepo.createQueryBuilder('g')
    qb.andWhere('g.userId = :userId', { userId })
    qb.andWhere('g.status = :status', { status: AvatarGroupStatus.ACTIVE })
    qb.orderBy('g.createdAt', 'DESC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()
    return { list, page, pageSize, total }
  }

  /**
   * 详情（含组内资产列表，校验所有权）
   */
  async findOne(userId: string, id: string): Promise<AvatarGroup> {
    const group = await this.avatarGroupRepo.findOne({
      where: { id, userId, status: AvatarGroupStatus.ACTIVE },
      relations: ['assets'],
    })
    if (!group) {
      throw BusinessException.notFound('真人形象组')
    }
    return group
  }

  /**
   * 更新形象组（名称变更时重新校验唯一性）
   */
  async update(userId: string, id: string, dto: UpdateAvatarGroupDto): Promise<AvatarGroup> {
    const group = await this.findOne(userId, id)

    if (dto.name !== undefined && dto.name !== group.name) {
      await this.ensureNameUnique(userId, dto.name, id)
      group.name = dto.name
    }
    if (dto.description !== undefined) {
      group.description = dto.description
    }
    if (dto.authorizationKey !== undefined) {
      group.authorizationKey = dto.authorizationKey
    }

    const saved = await this.avatarGroupRepo.save(group)
    this.logger.log(`User ${userId} updated avatar group ${id}`)
    return saved
  }

  /**
   * 删除形象组
   * 1. 校验所有权
   * 2. 查询组内所有 ACTIVE 资产
   * 3. 逐个删除 OSS 文件（容错）→ 批量删除数据库记录
   * 4. 软删除形象组（status=DELETED，assetCount 清零）
   */
  async delete(userId: string, id: string): Promise<{ success: boolean }> {
    const group = await this.findOne(userId, id)

    const assets = await this.assetRepo.find({
      where: { avatarGroupId: id, status: AssetStatus.ACTIVE },
    })

    for (const asset of assets) {
      const ossDeleted = await this.ossService.delete(asset.ossKey)
      if (!ossDeleted) {
        this.logger.warn(`OSS 文件删除失败 assetId=${asset.id} ossKey=${asset.ossKey}`)
      }
    }
    if (assets.length > 0) {
      await this.assetRepo.remove(assets)
    }

    group.status = AvatarGroupStatus.DELETED
    group.assetCount = 0
    await this.avatarGroupRepo.save(group)

    this.logger.log(`User ${userId} deleted avatar group ${id} (cascaded ${assets.length} assets)`)
    return { success: true }
  }

  /**
   * 校验同用户下形象组名称唯一性（仅对 ACTIVE 组校验，已删除的可复用名称）
   */
  private async ensureNameUnique(userId: string, name: string, excludeId?: string): Promise<void> {
    const qb = this.avatarGroupRepo
      .createQueryBuilder('g')
      .where('g.userId = :userId', { userId })
      .andWhere('g.name = :name', { name })
      .andWhere('g.status = :status', { status: AvatarGroupStatus.ACTIVE })
    if (excludeId) {
      qb.andWhere('g.id != :excludeId', { excludeId })
    }
    const existed = await qb.getOne()
    if (existed) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '同名真人形象组已存在，请更换名称', {
        name,
      })
    }
  }
}
