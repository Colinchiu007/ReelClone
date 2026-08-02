/**
 * GenerationCancelHandler — 取消任务
 *
 * 流程：
 *  1. 查询任务 + 校验所有权
 *  2. 调用 Temporal cancelWorkflow（非 Mock 模式）
 *  3. 更新 Task 状态为 FAILED
 *  4. 更新 Work 状态为 CANCELLED
 *  5. 调用 billing-service 释放冻结积分
 */
import { Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  GenerationExecution,
  GenerationExecutionStage,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus,
} from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'
import { BillingClient } from '../billing.client'
import {
  findOneTask,
  getBillingReservation,
  releaseBillingReservation,
  type GenerationDeps,
} from './shared'

export class GenerationCancelHandler {
  private readonly logger = new Logger(GenerationCancelHandler.name)

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly temporalService: TemporalService,
    private readonly configService: ConfigService,
  ) {}

  private isMockMode(): boolean {
    return this.configService.get<string>('TEMPORAL_MOCK_MODE') === 'true'
  }

  /**
   * 取消任务
   */
  async cancel(userId: string, taskId: string): Promise<void> {
    const { task, work } = await findOneTask(this.dataSource, userId, taskId)

    if (
      task.status !== GenerationTaskStatus.PENDING &&
      task.status !== GenerationTaskStatus.RUNNING
    ) {
      throw BusinessException.validationError(`任务当前状态为 ${task.status}，无法取消`)
    }

    const taskRepo = this.dataSource.getRepository(GenerationTask)
    const workRepo = this.dataSource.getRepository(Work)
    const executionRepo = this.dataSource.getRepository(GenerationExecution)

    // 真实模式：提交 Temporal 取消请求，等待 Provider 确认
    if (!this.isMockMode()) {
      if (!task.providerTaskId) {
        throw BusinessException.taskFailed('工作流启动状态未确认，暂不能取消或退款，请稍后重试')
      }
      const workflowId = this.temporalService.getVideoGenerationWorkflowId({
        workId: work.id,
        generationTaskId: task.id,
      })
      try {
        await this.temporalService.cancelWorkflow(workflowId)
      } catch (err) {
        this.logger.error(`取消工作流失败 taskId=${taskId}: ${(err as Error).message}`)
        throw BusinessException.taskFailed(`取消工作流失败，请稍后重试: ${(err as Error).message}`)
      }
      const activeExecId = (work.modelConfig.activeExecutionId as string) ?? null
      if (activeExecId) {
        await executionRepo.update(activeExecId, {
          stage: GenerationExecutionStage.PROVIDER_CANCEL_PENDING,
        })
      }
      this.logger.log(`已提交取消请求 taskId=${taskId}，等待 Provider 确认后结算`)
      return
    }

    // Mock 模式：同步取消
    await taskRepo.update(task.id, {
      status: GenerationTaskStatus.FAILED,
      error: '用户取消',
      completedAt: new Date(),
    })
    await workRepo.update(work.id, { status: WorkStatus.CANCELLED })

    const mockExecId = (work.modelConfig.activeExecutionId as string) ?? null
    if (mockExecId) {
      await executionRepo.update(mockExecId, {
        stage: GenerationExecutionStage.CANCELED,
      })
    }

    const deps: GenerationDeps = {
      redis: null as never,
      dataSource: this.dataSource,
      billingClient: this.billingClient,
      templateClient: null as never,
    }
    await releaseBillingReservation(deps, work, getBillingReservation(work), `taskId=${taskId}`)
  }
}
