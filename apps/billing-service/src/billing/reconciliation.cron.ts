/**
 * ReconciliationCron — 定时对账任务
 *
 * 调度（基于 @nestjs/schedule 的 Cron 装饰器）：
 *  - 每天 03:00 执行全量对账：`0 3 * * *`
 *  - 每小时整点执行增量对账（检查最近 1 小时的流水）：`0 * * * *`
 *
 * 容错：
 *  - 单次任务失败不影响后续调度（try/catch 捕获并记录 ERROR 日志）
 *  - 不一致告警由 ReconciliationService 内部记录 WARN，此处仅在汇总层面再打一条
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ReconciliationService } from './reconciliation.service'

/** 每小时增量对账的回看窗口（毫秒），默认 1 小时 */
const HOURLY_WINDOW_MS = 60 * 60 * 1000

@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name)

  constructor(private readonly reconciliation: ReconciliationService) {}

  /** 每天 03:00 全量对账 */
  @Cron('0 3 * * *')
  async runDailyFull(): Promise<void> {
    this.logger.log('定时任务：开始每日全量对账')
    try {
      const summary = await this.reconciliation.reconcileAll()
      if (summary.inconsistentCount > 0) {
        this.logger.warn(
          `每日全量对账发现不一致：${summary.inconsistentCount}/${summary.totalUsers}`,
        )
      }
    } catch (err) {
      this.logger.error(`每日全量对账失败：${(err as Error).message}`, (err as Error).stack)
    }
  }

  /** 每小时整点增量对账（检查最近 1 小时的流水） */
  @Cron('0 * * * *')
  async runHourlyIncremental(): Promise<void> {
    this.logger.log('定时任务：开始每小时增量对账')
    try {
      const since = new Date(Date.now() - HOURLY_WINDOW_MS)
      const summary = await this.reconciliation.reconcileSince(since)
      if (summary.inconsistentCount > 0) {
        this.logger.warn(
          `每小时增量对账发现不一致：${summary.inconsistentCount}/${summary.totalUsers}`,
        )
      }
    } catch (err) {
      this.logger.error(`每小时增量对账失败：${(err as Error).message}`, (err as Error).stack)
    }
  }
}
