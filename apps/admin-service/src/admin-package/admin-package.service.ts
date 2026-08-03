/**
 * 套餐管理服务（admin-service）
 *
 * 提供套餐 CRUD 与上下架能力，供运营后台使用。
 * 数据来源: main 库 packages 表。
 *
 * 约定：
 *  - 新建套餐默认状态为 OFFLINE，需手动上架（updateStatus → ACTIVE）
 *  - 列表查询返回全状态套餐，按 sort ASC、createdAt DESC 排序
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Package, PackageStatus, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BusinessException } from '@reelclone/common'
import { CreatePackageDto } from './dto/create-package.dto'
import { UpdatePackageDto } from './dto/update-package.dto'
import { UpdatePackageStatusDto } from './dto/update-package-status.dto'

/**
 * 套餐管理服务
 */
@Injectable()
export class AdminPackageService {
  private readonly logger = new Logger(AdminPackageService.name)

  constructor(
    @InjectRepository(Package, DATABASE_CONNECTIONS.MAIN)
    private readonly packageRepo: Repository<Package>,
  ) {}

  /**
   * 创建套餐
   *
   * 新建后默认状态为 OFFLINE，需通过 updateStatus 手动上架。
   *
   * @param dto 创建参数
   * @returns 创建的套餐实体
   */
  async create(dto: CreatePackageDto, operatorId?: string): Promise<Package> {
    const pkg = this.packageRepo.create({
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      originalPrice: dto.originalPrice ?? null,
      points: dto.points ?? 0,
      bonusPoints: dto.bonusPoints ?? 0,
      duration: dto.duration ?? 0,
      features: dto.features ?? [],
      type: dto.type,
      status: PackageStatus.OFFLINE,
      sort: dto.sort ?? 0,
    })

    const saved = await this.packageRepo.save(pkg)
    this.logger.log(
      `创建套餐 packageId=${saved.id} name=${saved.name} operatorId=${operatorId ?? 'unknown'}`,
    )
    return saved
  }

  /**
   * 编辑套餐
   *
   * 仅更新传入的字段，未传入的字段保持不变。
   *
   * @param id  套餐 ID
   * @param dto 编辑参数
   * @returns 更新后的套餐实体
   * @throws BusinessException NOT_FOUND 套餐不存在
   */
  async update(id: string, dto: UpdatePackageDto, operatorId?: string): Promise<Package> {
    const pkg = await this.packageRepo.findOne({ where: { id } })
    if (!pkg) {
      throw BusinessException.notFound('套餐')
    }

    // 合并传入字段（DTO 经 whitelist 过滤，仅含客户端提交的字段）
    Object.assign(pkg, dto)

    const saved = await this.packageRepo.save(pkg)
    this.logger.log(`编辑套餐 packageId=${id} operatorId=${operatorId ?? 'unknown'}`)
    return saved
  }

  /**
   * 更新套餐状态（上架 / 下架）
   *
   * @param id  套餐 ID
   * @param dto 状态参数（ACTIVE 上架 / OFFLINE 下架）
   * @returns 更新后的套餐实体
   * @throws BusinessException NOT_FOUND 套餐不存在
   */
  async updateStatus(
    id: string,
    dto: UpdatePackageStatusDto,
    operatorId?: string,
  ): Promise<Package> {
    const pkg = await this.packageRepo.findOne({ where: { id } })
    if (!pkg) {
      throw BusinessException.notFound('套餐')
    }

    pkg.status = dto.status

    const saved = await this.packageRepo.save(pkg)
    this.logger.log(
      `更新套餐状态 packageId=${id} status=${dto.status} operatorId=${operatorId ?? 'unknown'}`,
    )
    return saved
  }

  /**
   * 套餐列表（全状态）
   *
   * 返回所有套餐（不限状态），按 sort ASC、createdAt DESC 排序。
   *
   * @returns 套餐列表
   */
  async findAll(): Promise<Package[]> {
    return this.packageRepo.find({
      order: { sort: 'ASC', createdAt: 'DESC' },
    })
  }
}
