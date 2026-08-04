/**
 * PackageExpiryCron — 套餐到期自动降级定时任务
 *
 * 调度：每天凌晨 01:00 执行（`0 1 * * *`）
 *  - 选择 01:00 而非 00:00 避开零点高峰
 *  - 与对账任务（03:00）错开，减少数据库压力
 *
 * 容错：
 *  - 单次任务失败不影响后续调度（try/catch 捕获并记录 ERROR 日志）
 *  - 幂等安全：重复运行不会产生副作用
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PackageExpiryService } from './package-expiry.service'

@Injectable()
export class PackageExpiryCron {
  private readonly logger = new Logger(PackageExpiryCron.name)

  constructor(private readonly packageExpiry: PackageExpiryService) {}

  /** 每天凌晨 01:00 执行套餐过期扫描 */
  @Cron('0 1 * * *')
  async expireOverduePackages(): Promise<void> {
    this.logger.log('定时任务：开始扫描到期套餐')
    try {
      const expired = await this.packageExpiry.expireOverduePackages()
      if (expired > 0) {
        this.logger.log(`套餐到期降级完成：共 ${expired} 个套餐已标记为 EXPIRED`)
      } else {
        this.logger.debug('套餐到期扫描完成：无过期套餐')
      }
    } catch (err) {
      this.logger.error(
        `套餐到期扫描失败：${(err as Error).message}`,
        (err as Error).stack,
      )
    }
  }
}
