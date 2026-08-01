import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectDataSource } from '@nestjs/typeorm'
import {
  BillingProjectionDeliveryStatus,
  BillingProjectionOutbox,
  DATABASE_CONNECTIONS,
} from '@reelclone/database'
import { DataSource } from 'typeorm'
import { CreditReservationService } from './credit-reservation.service'

/** PENDING 超过此时间（毫秒）触发 age 告警。 */
const AGE_WARN_MS = 5 * 60_000
/** PENDING 超过此时间（毫秒）触发 age 严重告警。 */
const AGE_CRITICAL_MS = 30 * 60_000
/** backlog 超过此数量触发告警。 */
const BACKLOG_WARN_COUNT = 20

/**
 * 重放 main -> billing 的 V2 账务 outbox。
 *
 * 每 15 秒执行一次：claim → 投影 → 记录 backlog/age 指标。
 * DEAD 记录触发 ERROR 级别日志（供告警系统采集）。
 */
@Injectable()
export class BillingProjectionCron {
  private readonly logger = new Logger(BillingProjectionCron.name)

  constructor(
    private readonly reservations: CreditReservationService,
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly mainDataSource: DataSource,
  ) {}

  @Cron('*/15 * * * * *')
  async projectPending(): Promise<void> {
    try {
      const result = await this.reservations.projectPending()
      this.logger.debug(
        `账务投影批次: claimed=${result.claimed} projected=${result.projected} failed=${result.failed}`,
      )
      await this.reportBacklogMetrics()
    } catch (err) {
      this.logger.error(`账务投影调度失败: ${(err as Error).message}`, (err as Error).stack)
    }
  }

  /**
   * 收集 backlog 和 age 指标：
   * - PENDING 总数（backlog）
   * - 最老 PENDING 记录的 age
   * - DEAD 计数
   */
  private async reportBacklogMetrics(): Promise<void> {
    const repo = this.mainDataSource.getRepository(BillingProjectionOutbox)

    const pendingCount = await repo.count({
      where: { deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
    })

    if (pendingCount > BACKLOG_WARN_COUNT) {
      this.logger.warn(
        `账务投影 backlog 告警: PENDING=${pendingCount} 超过阈值 ${BACKLOG_WARN_COUNT}`,
      )
    }

    // 查找最老的 PENDING 记录
    const oldest = await repo.findOne({
      where: { deliveryStatus: BillingProjectionDeliveryStatus.PENDING },
      order: { createdAt: 'ASC' },
    })

    if (oldest) {
      const ageMs = Date.now() - oldest.createdAt.getTime()
      if (ageMs > AGE_CRITICAL_MS) {
        this.logger.error(
          `账务投影 age 严重告警: 最老 PENDING 记录已等待 ${Math.round(ageMs / 60_000)} 分钟 (id=${oldest.id})`,
        )
      } else if (ageMs > AGE_WARN_MS) {
        this.logger.warn(
          `账务投影 age 告警: 最老 PENDING 记录已等待 ${Math.round(ageMs / 60_000)} 分钟 (id=${oldest.id})`,
        )
      }
    }

    // DEAD 计数
    const deadCount = await repo.count({
      where: { deliveryStatus: BillingProjectionDeliveryStatus.DEAD },
    })
    if (deadCount > 0) {
      this.logger.error(`账务投影 DEAD 计数: ${deadCount} 条毒丸事件需人工介入`)
    }
  }
}
