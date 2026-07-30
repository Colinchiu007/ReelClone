/**
 * UploadReconciliationCron — 用户上传 ANALYZING 超时对账定时任务
 *
 * 调度（基于 @nestjs/schedule 的 Cron 装饰器）：
 *  - 每 10 分钟执行一次
 *
 * 容错：
 *  - 单次任务失败不影响后续调度（try/catch 捕获并记录 ERROR 日志）
 *  - 单模板失败由 UploadReconciliationService 内部处理，不中断整体
 *
 * 与 RewardReconciliationCron 的区别：
 *  - RewardReconciliationCron: 对比 useCount 与 billing 流水，补发漏发积分（每 30 分钟）
 *  - UploadReconciliationCron:  兜底 ANALYZING 卡死状态，查询/取消 Temporal 工作流（每 10 分钟）
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { UploadReconciliationService } from './upload-reconciliation.service'

@Injectable()
export class UploadReconciliationCron {
  private readonly logger = new Logger(UploadReconciliationCron.name)

  constructor(private readonly reconciliation: UploadReconciliationService) {}

  /** 每 10 分钟执行一次 ANALYZING 超时对账 */
  @Cron('*/10 * * * *')
  async runUploadReconciliation(): Promise<void> {
    this.logger.log('定时任务：开始 ANALYZING 超时对账')
    try {
      const result = await this.reconciliation.reconcile()
      if (result.failedCount > 0 || result.errorCount > 0) {
        this.logger.warn(
          `ANALYZING 超时对账发现异常 scanned=${result.scannedCount} failed=${result.failedCount} skipped=${result.skippedCount} errors=${result.errorCount}`,
        )
      }
    } catch (err) {
      this.logger.error(`ANALYZING 超时对账失败：${(err as Error).message}`, (err as Error).stack)
    }
  }
}
