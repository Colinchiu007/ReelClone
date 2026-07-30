/**
 * RewardReconciliationCron — 模板奖励漏发补发定时任务
 *
 * 调度（基于 @nestjs/schedule 的 Cron 装饰器）：
 *  - 每 30 分钟执行一次（cron 表达式：星号斜杠30 空格 星号 空格 星号 空格 星号 空格 星号）
 *
 * 容错：
 *  - 单次任务失败不影响后续调度（try/catch 捕获并记录 ERROR 日志）
 *  - 补发明细由 RewardReconciliationService 内部记录，此处仅在汇总层面再打一条
 *
 * 与 ReconciliationCron（billing-service 余额对账）的区别：
 *  - ReconciliationCron：对比 main 库 User 余额与 billing 库流水聚合（跨库一致性）
 *  - RewardReconciliationCron：对比 template 库 useCount 与 billing 库 REWARD 流水数（奖励漏发补发）
 */
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { RewardReconciliationService } from './reward-reconciliation.service'

@Injectable()
export class RewardReconciliationCron {
  private readonly logger = new Logger(RewardReconciliationCron.name)

  constructor(private readonly reconciliation: RewardReconciliationService) {}

  /** 每 30 分钟执行一次奖励漏发对账 */
  @Cron('*/30 * * * *')
  async runRewardReconciliation(): Promise<void> {
    this.logger.log('定时任务：开始奖励漏发对账')
    try {
      const result = await this.reconciliation.reconcile()
      if (result.underpaidCount > 0) {
        this.logger.warn(
          `奖励漏发对账发现 ${result.underpaidCount} 个模板有漏发，补发成功 ${result.reissuedCount} 次，失败 ${result.failedCount} 次`,
        )
      }
    } catch (err) {
      this.logger.error(`奖励漏发对账失败：${(err as Error).message}`, (err as Error).stack)
    }
  }
}
