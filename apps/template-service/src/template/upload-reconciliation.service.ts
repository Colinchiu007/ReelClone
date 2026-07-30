/**
 * UploadReconciliationService — 用户上传视频转模板 ANALYZING 超时对账
 *
 * 职责（B3 修复）:
 *  1. 扫描 template 库中 status=ANALYZING 且 updatedAt 早于阈值（默认 20 分钟）的模板
 *  2. 对每个超时模板，根据 Temporal 工作流状态分类处理：
 *     - workflowId IS NULL                → 直接标记 ANALYSIS_FAILED（submitUpload 进程崩溃遗留）
 *     - status=RUNNING 且超时             → cancelWorkflow + 标记 ANALYSIS_FAILED
 *     - status=COMPLETED                  → 跳过（finalizeTemplate Activity 应已更新，仅 warn 日志）
 *     - status=FAILED/TIMED_OUT/TERMINATED/CANCELLED → 标记 ANALYSIS_FAILED
 *     - 工作流查询抛错（NotFound 等）      → 标记 ANALYSIS_FAILED（reason: "工作流记录不存在"）
 *  3. 单模板对账失败不中断整体流程
 *
 * 阈值设计：
 *  - 工作流执行超时 15min（startTemplateGeneration 配置）+ 5min 缓冲 = 20min
 *  - 单次扫描最多 100 条（避免 Temporal 查询过载）
 *
 * 幂等性：
 *  - 仅处理 ANALYZING 状态模板，已被 finalize/fail 流程更新的模板自动跳过
 *  - 重复扫描安全：internalFail 幂等 + 状态校验
 *
 * 与 RewardReconciliationService 的区别：
 *  - RewardReconciliation: 对比 useCount 与 billing 流水，补发漏发积分（积分正确性）
 *  - UploadReconciliation: 兜底 ANALYZING 卡死状态，调用 Temporal 查询/取消（状态正确性）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DATABASE_CONNECTIONS, Template, TemplateStatus } from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'

/** ANALYZING 超时阈值（分钟）—— 工作流 15min + 5min 缓冲 */
const ANALYZING_TIMEOUT_MINUTES = 20

/** 单次扫描最大模板数 */
const MAX_TEMPLATES_PER_RUN = 100

/** 对账结果 */
export interface UploadReconcileResult {
  /** 扫描的超时模板数 */
  scannedCount: number
  /** 标记为 ANALYSIS_FAILED 的数量 */
  failedCount: number
  /** 跳过的数量（如 COMPLETED 状态） */
  skippedCount: number
  /** 处理失败（异常）的数量 */
  errorCount: number
  /** 明细 */
  details: Array<{
    templateId: string
    workflowId: string | null
    action: 'marked_failed' | 'skipped' | 'error'
    reason: string
  }>
}

@Injectable()
export class UploadReconciliationService {
  private readonly logger = new Logger(UploadReconciliationService.name)

  constructor(
    @InjectRepository(Template, DATABASE_CONNECTIONS.TEMPLATE)
    private readonly templateRepo: Repository<Template>,
    private readonly temporalService: TemporalService,
  ) {}

  /**
   * 执行一次 ANALYZING 超时对账
   *
   * @returns 对账结果汇总
   */
  async reconcile(): Promise<UploadReconcileResult> {
    const startedAt = Date.now()
    this.logger.log('ANALYZING 超时对账开始')

    // 1. 扫描超时模板
    const timeoutThreshold = new Date(Date.now() - ANALYZING_TIMEOUT_MINUTES * 60 * 1000)
    const templates = await this.templateRepo
      .createQueryBuilder('t')
      .where('t.status = :status', { status: TemplateStatus.ANALYZING })
      .andWhere('t.updatedAt < :threshold', { threshold: timeoutThreshold })
      .orderBy('t.updatedAt', 'ASC')
      .take(MAX_TEMPLATES_PER_RUN)
      .getMany()

    let failedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const details: UploadReconcileResult['details'] = []

    for (const template of templates) {
      try {
        const action = await this.reconcileOne(template)
        details.push({
          templateId: template.id,
          workflowId: template.workflowId,
          action: action.action,
          reason: action.reason,
        })

        if (action.action === 'marked_failed') failedCount++
        else if (action.action === 'skipped') skippedCount++
      } catch (err) {
        errorCount++
        details.push({
          templateId: template.id,
          workflowId: template.workflowId,
          action: 'error',
          reason: (err as Error).message,
        })
        this.logger.error(
          `ANALYZING 对账单模板失败 templateId=${template.id}: ${(err as Error).message}`,
        )
      }
    }

    const elapsed = Date.now() - startedAt
    this.logger.log(
      `ANALYZING 超时对账完成 scanned=${templates.length} failed=${failedCount} skipped=${skippedCount} errors=${errorCount} 耗时=${elapsed}ms`,
    )

    return {
      scannedCount: templates.length,
      failedCount,
      skippedCount,
      errorCount,
      details,
    }
  }

  /**
   * 处理单个超时模板
   *
   * @returns 处理动作 + 原因
   */
  private async reconcileOne(
    template: Template,
  ): Promise<{ action: 'marked_failed' | 'skipped'; reason: string }> {
    // 1. workflowId 为空 —— submitUpload 进程崩溃遗留
    if (!template.workflowId) {
      await this.markFailed(template.id, '工作流未启动（submitUpload 进程崩溃遗留）')
      this.logger.warn(`ANALYZING 对账：workflowId 为空，标记失败 templateId=${template.id}`)
      return { action: 'marked_failed', reason: 'workflowId is null' }
    }

    // 2. 查询 Temporal 工作流状态
    let workflowStatus: string
    try {
      const describe = await this.temporalService.getWorkflowStatus(template.workflowId)
      // describe.status 是 { code, name } 对象，name 为字符串（RUNNING/COMPLETED/FAILED 等）
      workflowStatus = describe.status?.name ?? 'UNKNOWN'
    } catch (err) {
      // 工作流不存在（Temporal NotFound）或其他查询错误 → 标记失败
      await this.markFailed(template.id, `工作流查询失败: ${(err as Error).message}`)
      this.logger.warn(
        `ANALYZING 对账：工作流查询失败，标记失败 templateId=${template.id} workflowId=${template.workflowId}`,
      )
      return {
        action: 'marked_failed',
        reason: `workflow not found: ${(err as Error).message}`,
      }
    }

    // 3. 根据工作流状态分类处理
    switch (workflowStatus) {
      case 'RUNNING':
        // 仍在运行但已超时阈值 → 取消工作流 + 标记失败
        try {
          await this.temporalService.cancelWorkflow(template.workflowId)
          this.logger.warn(
            `ANALYZING 对账：工作流超时取消 templateId=${template.id} workflowId=${template.workflowId}`,
          )
        } catch (err) {
          // 取消失败不阻塞标记失败（工作流可能已自然结束）
          this.logger.warn(
            `ANALYZING 对账：取消工作流失败（忽略） templateId=${template.id}: ${(err as Error).message}`,
          )
        }
        await this.markFailed(template.id, '工作流超时未完成，已取消')
        return { action: 'marked_failed', reason: `running timeout, canceled` }

      case 'COMPLETED':
        // 工作流已完成但模板状态仍为 ANALYZING —— finalizeTemplate Activity 可能漏调用
        // 不主动更新为 ACTIVE（缺少 meta/analysisReport 等字段），仅记录 warn 供人工介入
        this.logger.warn(
          `ANALYZING 对账：工作流已完成但模板仍为 ANALYZING，跳过 templateId=${template.id} workflowId=${template.workflowId}`,
        )
        return { action: 'skipped', reason: 'workflow completed but template still ANALYZING' }

      case 'FAILED':
      case 'TIMED_OUT':
      case 'TERMINATED':
      case 'CANCELLED':
        await this.markFailed(template.id, `工作流状态异常: ${workflowStatus}`)
        return { action: 'marked_failed', reason: `workflow ${workflowStatus}` }

      default:
        // CONTINUED_AS_NEW / UNKNOWN 等其他状态 → 标记失败保守处理
        await this.markFailed(template.id, `工作流未知状态: ${workflowStatus}`)
        return { action: 'marked_failed', reason: `workflow status=${workflowStatus}` }
    }
  }

  /**
   * 标记模板为 ANALYSIS_FAILED（带状态校验的幂等更新）
   *
   * 使用 UPDATE ... WHERE status='ANALYZING' 防止与 finalize/fail 流程并发竞态。
   */
  private async markFailed(templateId: string, reason: string): Promise<void> {
    const result = await this.templateRepo
      .createQueryBuilder()
      .update(Template)
      .set({
        status: TemplateStatus.ANALYSIS_FAILED,
        failureReason: reason,
      })
      .where('id = :id AND status = :status', {
        id: templateId,
        status: TemplateStatus.ANALYZING,
      })
      .execute()

    if (result.affected === 0) {
      // 状态已被其他流程更新（finalize/fail），跳过
      this.logger.log(`ANALYZING 对账：模板状态已被其他流程更新，跳过 templateId=${templateId}`)
    }
  }
}
