import type { WorkStatus as TemporalWorkStatus, WorkflowStateStore } from '@reelclone/temporal'
import {
  GenerationExecution,
  GenerationExecutionStage,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus as DatabaseWorkStatus,
} from '@reelclone/database'
import { DataSource } from 'typeorm'

function readString(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function taskStatusFor(status: TemporalWorkStatus): GenerationTaskStatus {
  switch (status) {
    case 'pending':
      return GenerationTaskStatus.PENDING
    case 'processing':
      return GenerationTaskStatus.RUNNING
    case 'completed':
      return GenerationTaskStatus.COMPLETED
    default:
      return GenerationTaskStatus.FAILED
  }
}

function workStatusFor(status: TemporalWorkStatus): DatabaseWorkStatus {
  switch (status) {
    case 'pending':
      return DatabaseWorkStatus.PENDING
    case 'processing':
      return DatabaseWorkStatus.PROCESSING
    case 'completed':
      return DatabaseWorkStatus.COMPLETED
    case 'canceled':
      return DatabaseWorkStatus.CANCELLED
    default:
      // 数据库没有 TIMEOUT 状态，以 FAILED 持久化并在 errorLog 保留阶段。
      return DatabaseWorkStatus.FAILED
  }
}

function isTerminal(status: TemporalWorkStatus): boolean {
  return status !== 'pending' && status !== 'processing'
}

/** C1.3: 将 Temporal 终态映射到 GenerationExecution 终态 stage。 */
function executionStageFor(status: TemporalWorkStatus): GenerationExecutionStage {
  switch (status) {
    case 'completed':
      return GenerationExecutionStage.COMPLETED
    case 'canceled':
      return GenerationExecutionStage.CANCELED
    default:
      // failed / timeout / 未知终态均归入 FAILED
      return GenerationExecutionStage.FAILED
  }
}

/**
 * 将 Temporal 的工作流状态回写到 main 数据库。
 *
 * Work 的 `activeGenerationTaskId` 在创建/重试时更新。旧工作流只能回写
 * 自己的 GenerationTask，不能覆盖已重试任务对应的 Work 状态。
 */
export class TypeOrmWorkflowStateStore implements WorkflowStateStore {
  constructor(private readonly mainDataSource: DataSource) {}

  async updateWorkStatus(
    workId: string,
    status: TemporalWorkStatus,
    data?: Record<string, unknown>,
    generationTaskId?: string,
  ): Promise<boolean> {
    const workRepo = this.mainDataSource.getRepository(Work)
    const taskRepo = this.mainDataSource.getRepository(GenerationTask)
    const work = await workRepo.findOne({ where: { id: workId } })
    if (!work) {
      throw new Error(`Work 不存在，无法回写工作流状态: ${workId}`)
    }

    const taskUpdate: Partial<GenerationTask> = {
      status: taskStatusFor(status),
    }
    const providerTaskId = readString(data, 'providerTaskId')
    if (providerTaskId) {
      taskUpdate.providerTaskId = providerTaskId
    }
    if (status === 'processing') {
      taskUpdate.startedAt = new Date()
      const processingError = readString(data, 'error')
      if (processingError) {
        taskUpdate.error = processingError
      }
    }
    if (isTerminal(status)) {
      taskUpdate.completedAt = new Date()
      taskUpdate.error =
        readString(data, 'error') ??
        readString(data, 'reason') ??
        (status === 'timeout' ? '视频生成超时' : status === 'canceled' ? '任务已取消' : null)
    }
    if (generationTaskId) {
      await taskRepo.update({ id: generationTaskId, workId }, taskUpdate as never)
    }

    const workUpdate: Partial<Work> = {
      status: workStatusFor(status),
    }
    if (status === 'completed') {
      workUpdate.resultKey = readString(data, 'resultKey') ?? null
      workUpdate.resultUrl = readString(data, 'resultUrl') ?? null
      workUpdate.thumbnailKey = readString(data, 'coverKey') ?? null
      workUpdate.errorLog = null
    } else if (isTerminal(status)) {
      const stage = readString(data, 'stage') ?? status
      const error =
        readString(data, 'error') ??
        readString(data, 'reason') ??
        (status === 'timeout'
          ? '视频生成超时'
          : status === 'canceled'
            ? '任务已取消'
            : '视频生成失败')
      workUpdate.errorLog = {
        stage,
        error,
        providerTaskId: readString(data, 'providerTaskId'),
      }
      if (stage === 'moderation_rejected') {
        workUpdate.moderationResult = {
          decision: 'rejected',
          reason: readString(data, 'reason'),
          labels: Array.isArray(data?.labels) ? data.labels : [],
        }
      }
    } else if (status === 'processing') {
      const stage = readString(data, 'stage')
      const error = readString(data, 'error')
      if (stage || error) {
        workUpdate.errorLog = {
          stage: stage ?? 'processing',
          error,
          providerTaskId: readString(data, 'providerTaskId'),
        }
      }
    }

    if (generationTaskId) {
      // 条件直接放到 UPDATE 中，避免"先读 active task，随后旧工作流覆盖新任务"的竞态窗口。
      const updateResult = await workRepo
        .createQueryBuilder()
        .update(Work)
        .set(workUpdate as never)
        .where('id = :workId', { workId })
        .andWhere("model_config ->> 'activeGenerationTaskId' = :generationTaskId", {
          generationTaskId,
        })
        .execute()
      if ((updateResult.affected ?? 0) === 0) {
        return true
      }
    } else {
      // 仅兼容没有 generationTaskId 的旧工作流；新版工作流必须走上方条件更新。
      await workRepo.update(workId, workUpdate as never)
    }

    // C1.3: 终态时更新 GenerationExecution stage
    if (isTerminal(status)) {
      const activeExecutionId = (work.modelConfig.activeExecutionId as string) ?? null
      if (activeExecutionId) {
        const executionRepo = this.mainDataSource.getRepository(GenerationExecution)
        const stage = executionStageFor(status)
        await executionRepo.update(activeExecutionId, { stage })
      }
    }

    return true
  }
}
