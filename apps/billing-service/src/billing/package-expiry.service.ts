/**
 * PackageExpiryService — 套餐到期自动降级
 *
 * 职责：
 *  1. 扫描 user_packages 表中 status = 'ACTIVE' 且 expired_at < NOW() 的记录
 *  2. 将其状态更新为 EXPIRED
 *  3. 记录操作日志（扫描数量、过期数量）
 *
 * 设计要点：
 *  - 幂等：重复运行只处理未过期的记录（WHERE status = 'ACTIVE' AND expired_at < NOW()）
 *  - 批量处理：每批最多 EXPIRY_BATCH_SIZE 条，避免大表内存问题
 *  - 不扣减 currentPoints：积分是消耗型余额，套餐过期后只是标记套餐状态为 EXPIRED
 */
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, In } from 'typeorm'
import { DATABASE_CONNECTIONS, UserPackageStatus } from '@reelclone/database'

/** 每批处理的最大记录数 */
const EXPIRY_BATCH_SIZE = 500

@Injectable()
export class PackageExpiryService {
  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
  ) {}

  /**
   * 扫描并过期所有已到期的活跃套餐
   * @returns 本次过期的套餐数量
   */
  async expireOverduePackages(): Promise<number> {
    const userPackageRepo = this.mainDataSource.getRepository('user_packages')
    let totalExpired = 0
    let hasMore = true

    while (hasMore) {
      // 批量查询已过期的活跃套餐 ID
      const overdueIds = await userPackageRepo
        .createQueryBuilder('up')
        .select('up.id')
        .where('up.status = :status', { status: UserPackageStatus.ACTIVE })
        .andWhere('up.expired_at < NOW()')
        .limit(EXPIRY_BATCH_SIZE)
        .getRawMany<{ id: string }>()

      if (overdueIds.length === 0) {
        hasMore = false
        break
      }

      const ids = overdueIds.map((r) => r.id)
      const result = await userPackageRepo.update(
        { id: In(ids) },
        { status: UserPackageStatus.EXPIRED },
      )

      totalExpired += result.affected ?? 0
      hasMore = overdueIds.length === EXPIRY_BATCH_SIZE
    }

    return totalExpired
  }
}
