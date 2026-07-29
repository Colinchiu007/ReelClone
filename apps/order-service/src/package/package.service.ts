/**
 * 套餐服务
 *
 * 提供套餐列表查询（仅 PUBLISHED/ACTIVE 状态）和套餐详情查询。
 * 数据来源: main 库 packages 表。
 *
 * 排序规则: sort ASC, price ASC
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Package, PackageStatus, DATABASE_CONNECTIONS } from '@reelclone/database';
import { BusinessException } from '@reelclone/common';

/**
 * 套餐服务
 */
@Injectable()
export class PackageService {
  constructor(
    @InjectRepository(Package, DATABASE_CONNECTIONS.MAIN)
    private readonly packageRepo: Repository<Package>,
  ) {}

  /**
   * 套餐列表（公开）
   *
   * 仅返回已上架（ACTIVE）状态的套餐，按 sort 升序、price 升序排列。
   */
  async findAll(): Promise<Package[]> {
    return this.packageRepo.find({
      where: { status: PackageStatus.ACTIVE },
      order: { sort: 'ASC', price: 'ASC' },
    });
  }

  /**
   * 套餐详情（公开）
   *
   * @param id 套餐 ID
   * @returns 套餐实体
   * @throws BusinessException NOT_FOUND 套餐不存在
   */
  async findOne(id: string): Promise<Package> {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      throw BusinessException.notFound('套餐');
    }
    return pkg;
  }
}
