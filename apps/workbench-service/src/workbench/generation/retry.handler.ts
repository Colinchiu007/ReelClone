/**
 * GenerationRetryHandler — 重试失败任务
 *
 * 流程：
 *  1. 查询原任务 + 校验所有权
 *  2. 创建新 GenerationTask（attempts = 原 attempts + 1）
 *  3. 重新冻结积分并重启独立的 Temporal 工作流
 *  4. 更新 Work 状态为 PENDING
 */
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import Redis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import { BusinessException, generateIdempotencyKey } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus,
} from '@reelclone/database'
import { type BillingReservation } from '@reelclone/temporal'
import { BillingClient } from '../billing.client'
import { isVideoType } from '../points-calculator.util'
import { type CreateGenerationDto } from '../dto/create-generation.dto'
import {
  billingOperationKey,
  buildDtoFromWork,
  createBillingReservation,
  findOneTask,
  releaseBillingReservation,
  releaseOwnedLock,
  retryLockKey,
  RETRY_LOCK_TTL,
  type CreateGenerationResult,
  type GenerationDeps,
} from './shared'
import { GenerationCreateHandler } from './create.handler'

export class GenerationRetryHandler {
  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly configService: ConfigService,
    private readonly createHandler: GenerationCreateHandler,
  ) {}

  private assertGenerationTypeSupported(type: CreateGenerationDto['generationType']): void {
    if (this.configService.get<string>('TEMPORAL_MOCK_MODE') !== 'true' && !isVideoType(type)) {
      throw BusinessException.validationError(
        '当前仅支持视频生成，文本和图片生成需在接入真实 Provider 后启用',
        { field: 'generationType', value: type },
      )
    }
  }

  private deps(redis: Redis): GenerationDeps {
    return {
      redis,
      dataSource: this.dataSource,
      billingClient: this.billingClient,
      templateClient: null as never,
    }
  }

  async retry(userId: string, taskId: string, redis: Redis): Promise<CreateGenerationResult> {
    const lockToken = uuidv4()
    const lockAcquired = await redis.set(
      retryLockKey(taskId),
      lockToken,
      'EX',
      RETRY_LOCK_TTL,
      'NX',
    )
    if (!lockAcquired) {
      throw BusinessException.rateLimited('任务正在重试，请稍后查询状态', { taskId })
    }

    try {
      const { task, work: requestedWork } = await findOneTask(this.dataSource, userId, taskId)

      // 原任务和 Work 都必须已终态
      if (
        task.status !== GenerationTaskStatus.FAILED ||
        (requestedWork.status !== WorkStatus.CANCELLED &&
          requestedWork.status !== WorkStatus.FAILED)
      ) {
        throw BusinessException.validationError(
          `任务当前状态为 ${task.status} / Work ${requestedWork.status}，无法重试`,
        )
      }

      const dto = buildDtoFromWork(requestedWork)
      // 复用 createHandler 的类型校验
      this.assertGenerationTypeSupported(dto.generationType)

      // 事务中锁定 Work、创建新 Task
      const claimed = await this.dataSource.transaction(async (manager) => {
        const transactionTaskRepo = manager.getRepository(GenerationTask)
        const transactionWorkRepo = manager.getRepository(Work)
        const work = await transactionWorkRepo
          .createQueryBuilder('work')
          .setLock('pessimistic_write')
          .where('work.id = :workId', { workId: requestedWork.id })
          .andWhere('work.userId = :userId', { userId })
          .getOne()
        if (!work) {
          throw BusinessException.notFound('作品', { workId: requestedWork.id })
        }
        if (work.status !== WorkStatus.CANCELLED && work.status !== WorkStatus.FAILED) {
          throw BusinessException.validationError(`Work 当前状态为 ${work.status}，无法重试`, {
            workId: work.id,
          })
        }

        const newTask = transactionTaskRepo.create({
          id: uuidv4(),
          workId: work.id,
          provider: task.provider,
          status: GenerationTaskStatus.PENDING,
          attempts: task.attempts + 1,
        })
        await transactionTaskRepo.save(newTask)
        work.status = WorkStatus.PENDING
        work.errorLog = null
        work.modelConfig = {
          ...(work.modelConfig ?? {}),
          activeGenerationTaskId: newTask.id,
        }
        await transactionWorkRepo.save(work)
        return { work, newTask }
      })

      const { work, newTask } = claimed
      const taskRepo = this.dataSource.getRepository(GenerationTask)
      const workRepo = this.dataSource.getRepository(Work)
      const retryIdempotencyKey = generateIdempotencyKey(userId, 'retry_generation', {
        taskId: newTask.id,
        workId: work.id,
      })
      const points = work.cost
      let reservation: BillingReservation | undefined

      try {
        const retryFreeze = await this.billingClient.freeze(
          userId,
          points,
          billingOperationKey(retryIdempotencyKey, 'freeze'),
          work.id,
        )
        reservation = createBillingReservation(points, retryIdempotencyKey, retryFreeze.freezeId)
        work.modelConfig = {
          ...(work.modelConfig ?? {}),
          idempotencyKey: retryIdempotencyKey,
          freezeId: reservation.freezeId,
          billingReservation: reservation,
          activeGenerationTaskId: newTask.id,
        }
        await workRepo.save(work)
        await this.createHandler.startWorkflow(work, newTask, dto, retryIdempotencyKey, points)
      } catch (err) {
        await taskRepo.update(newTask.id, {
          status: GenerationTaskStatus.FAILED,
          error: (err as Error).message,
          completedAt: new Date(),
        })
        await workRepo.update(work.id, {
          status: WorkStatus.FAILED,
          errorLog: { step: 'retry', message: (err as Error).message },
        })
        if (reservation) {
          await releaseBillingReservation(
            this.deps(redis),
            work,
            reservation,
            `retry taskId=${newTask.id}`,
          )
        }
        throw err
      }

      return { workId: work.id, taskId: newTask.id }
    } finally {
      await releaseOwnedLock(redis, retryLockKey(taskId), lockToken)
    }
  }
}
