/**
 * RewardReconciliationService — 模板奖励漏发补发对账
 *
 * 职责：
 *  1. 扫描用户上传的模板（userId 非空），对比 useCount 与 billing 库已发放的 REWARD 流水数
 *  2. 若 useCount > rewardCount，说明有漏发（incrementUseCount 中 reward 调用失败），
 *     按 (rewardCount, useCount] 区间逐条补发，幂等键使用 `reward:template:{id}:use:{n}`
 *  3. 幂等键与 incrementUseCount 一致，保证补发与实时发放不会重复
 *
 * 补发幂等键设计：
 *  - incrementUseCount 使用 `reward:template:{id}:use:{useCountAfter}`（自增后的值）
 *  - 补发时对 n ∈ (rewardCount, useCount] 调用 reward，幂等键 `reward:template:{id}:use:${n}`
 *  - 若该次实时发放已成功（DB 有流水），幂等机制返回首次结果，不重复发放
 *  - 若该次实时发放失败（DB 无流水），补发时成功写入
 *
 * 安全保障：
 *  - 补发失败不中断整体对账（try/catch 单模板）
 *  - 单次对账有最大补发条数限制，避免异常数据导致大量调用
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DATABASE_CONNECTIONS, Template } from '@reelclone/database'
import { BillingClient } from './billing.client'

/** 单次对账扫描的最大模板数 */
const MAX_TEMPLATES_PER_RUN = 500

/** 单个模板单次最大补发条数（防御异常数据） */
const MAX_REISSUE_PER_TEMPLATE = 50

/** 补发结果 */
export interface RewardReissueResult {
  /** 扫描的模板数 */
  scannedCount: number
  /** 有漏发的模板数 */
  underpaidCount: number
  /** 补发成功的次数 */
  reissuedCount: number
  /** 补发失败的次数 */
  failedCount: number
  /** 明细（每条补发的 templateId + useCount + 成功/失败） */
  details: Array<{
    templateId: string
    userId: string
    useCount: number
    rewardCountBefore: number
    reissued: number
    failed: number
  }>
}

@Injectable()
export class RewardReconciliationService {
  private readonly logger = new Logger(RewardReconciliationService.name)

  constructor(
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
    private readonly billingClient: BillingClient,
  ) {}

  /**
   * 执行一次奖励漏发对账
   *
   * 扫描策略：按 useCount DESC 排序，优先处理使用次数多的模板（漏发影响更大）。
   * 仅扫描 userId 非空 且 useCount > 0 的模板。
   *
   * @returns 补发结果汇总
   */
  async reconcile(): Promise<RewardReissueResult> {
    const startedAt = Date.now()
    this.logger.log('奖励漏发对账开始')

    // 1. 扫描候选模板（userId 非空 + useCount > 0），按 useCount DESC
    const templates = await this.templateRepo
      .createQueryBuilder('t')
      .where('t.userId IS NOT NULL')
      .andWhere('t.useCount > 0')
      .orderBy('t.useCount', 'DESC')
      .take(MAX_TEMPLATES_PER_RUN)
      .getMany()

    let underpaidCount = 0
    let reissuedCount = 0
    let failedCount = 0
    const details: RewardReissueResult['details'] = []

    for (const template of templates) {
      const userId = template.userId as string
      try {
        const rewardCount = await this.billingClient.getRewardCount(template.id)
        const underpaid = template.useCount - rewardCount

        if (underpaid <= 0) {
          // 已足额发放，跳过
          continue
        }

        underpaidCount++
        // 防御异常数据：限制单模板单次补发条数
        const toReissue = Math.min(underpaid, MAX_REISSUE_PER_TEMPLATE)

        this.logger.warn(
          `检测到漏发 templateId=${template.id} userId=${userId} useCount=${template.useCount} rewardCount=${rewardCount} 补发=${toReissue}`,
        )

        // 逐条补发：n ∈ (rewardCount, rewardCount + toReissue]
        let reissued = 0
        let failed = 0
        for (let n = rewardCount + 1; n <= rewardCount + toReissue; n++) {
          const idempotencyKey = `reward:template:${template.id}:use:${n}`
          try {
            await this.billingClient.reward({
              userId,
              amount: this.getRewardAmount(),
              templateId: template.id,
              idempotencyKey,
              description: `template:reward:${template.id}:use:${n} (reconcile)`,
            })
            reissued++
            reissuedCount++
          } catch (err) {
            failed++
            failedCount++
            this.logger.error(
              `补发失败 templateId=${template.id} useCount=${n} idempotencyKey=${idempotencyKey}: ${(err as Error).message}`,
            )
          }
        }

        details.push({
          templateId: template.id,
          userId,
          useCount: template.useCount,
          rewardCountBefore: rewardCount,
          reissued,
          failed,
        })
      } catch (err) {
        // 单模板对账失败（如 getRewardCount 调用失败），记录日志，不中断整体对账
        this.logger.error(`模板奖励对账失败 templateId=${template.id}: ${(err as Error).message}`)
      }
    }

    const elapsed = Date.now() - startedAt
    this.logger.log(
      `奖励漏发对账完成 scanned=${templates.length} underpaid=${underpaidCount} reissued=${reissuedCount} failed=${failedCount} 耗时=${elapsed}ms`,
    )

    return {
      scannedCount: templates.length,
      underpaidCount,
      reissuedCount,
      failedCount,
      details,
    }
  }

  /** 奖励积分数量（与 TemplateService 保持一致，默认 1） */
  private getRewardAmount(): number {
    return Number(process.env.TEMPLATE_REWARD_POINTS ?? 1)
  }
}
