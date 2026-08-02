/**
 * GenerationCreateHandler — 创建生成任务
 *
 * 流程：
 *  1. 幂等检查（Redis 缓存命中则返回已有 work）
 *  2. 计算消耗积分
 *  3. 创建 Work（status=PENDING）
 *  4. 调用 billing-service 冻结积分
 *  5. 创建 GenerationTask
 *  6. 创建 GenerationExecution（durable execution 权威记录，stage=INITIATED）
 *  7. 启动 Temporal 工作流（Mock 模式跳过）
 *  8. 缓存幂等结果
 */
import { Inject, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import Redis from 'ioredis'
import { createHash } from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { BusinessException, generateIdempotencyKey } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  GenerationExecution,
  GenerationExecutionStage,
  GenerationTask,
  GenerationTaskStatus,
  Work,
  WorkStatus,
} from '@reelclone/database'
import { TemporalService, WorkType } from '@reelclone/temporal'
import {
  type BillingReservation,
  type VideoGenParams,
  type VideoModelConfig,
} from '@reelclone/temporal'
import { CapabilityRegistry, CAPABILITY_REGISTRY, GenerationType } from '@reelclone/capability'
import { BillingClient } from '../billing.client'
import { TemplateClient } from '../template.client'
import { calculatePoints, isVideoType } from '../points-calculator.util'
import { type CreateGenerationDto } from '../dto/create-generation.dto'
import {
  billingOperationKey,
  cacheIdempotencyRecord,
  createBillingReservation,
  getIdempotencyRecord,
  getBillingReservation,
  releaseBillingReservation,
  releaseOwnedLock,
  mapToProvider,
  mapToWorkType,
  idemLockKey,
  IDEMPOTENCY_LOCK_TTL,
  type CreateGenerationResult,
  type GenerationDeps,
} from './shared'

export class GenerationCreateHandler {
  private readonly logger = new Logger(GenerationCreateHandler.name)

  constructor(
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly templateClient: TemplateClient,
    private readonly temporalService: TemporalService,
    private readonly configService: ConfigService,
    @Inject(CAPABILITY_REGISTRY) private readonly registry: CapabilityRegistry,
  ) {}

  private isMockMode(): boolean {
    return this.configService.get<string>('TEMPORAL_MOCK_MODE') === 'true'
  }

  private assertGenerationTypeSupported(type: GenerationType): void {
    if (!this.isMockMode() && !isVideoType(this.registry, type)) {
      throw BusinessException.validationError(
        '当前仅支持视频生成，文本和图片生成需在接入真实 Provider 后启用',
        { field: 'generationType', value: type },
      )
    }
  }

  /** 创建 Redis 幂等依赖容器（供 shared 工具使用） */
  private deps(redis: Redis): GenerationDeps {
    return {
      redis,
      dataSource: this.dataSource,
      billingClient: this.billingClient,
      templateClient: this.templateClient,
    }
  }

  async create(
    userId: string,
    dto: CreateGenerationDto,
    redis: Redis,
  ): Promise<CreateGenerationResult> {
    const idempotencyKey =
      dto.idempotencyKey ||
      generateIdempotencyKey(userId, 'create_generation', {
        generationType: dto.generationType,
        prompt: dto.prompt,
      })

    // 幂等检查
    const existing = await getIdempotencyRecord(redis, idempotencyKey)
    if (existing) {
      this.logger.log(`幂等命中，返回已有任务 workId=${existing.workId}`)
      return existing
    }

    // 请求锁
    const lockToken = uuidv4()
    const lockAcquired = await redis.set(
      idemLockKey(idempotencyKey),
      lockToken,
      'EX',
      IDEMPOTENCY_LOCK_TTL,
      'NX',
    )
    if (!lockAcquired) {
      const retryRecord = await getIdempotencyRecord(redis, idempotencyKey)
      if (retryRecord) return retryRecord
      throw BusinessException.rateLimited('请求正在处理中，请稍后重试', { idempotencyKey })
    }

    try {
      const lockedRecord = await getIdempotencyRecord(redis, idempotencyKey)
      if (lockedRecord) return lockedRecord

      this.assertGenerationTypeSupported(dto.generationType)

      // 计算积分
      const points = calculatePoints(this.registry, dto.generationType, {
        resolution: dto.resolution,
        duration: dto.duration,
      })
      if (points <= 0) {
        throw BusinessException.validationError('无法计算积分，请检查生成参数')
      }

      // 创建 Work
      const workRepo = this.dataSource.getRepository(Work)
      const workType = mapToWorkType(this.registry, dto.generationType)

      const modelConfig: Record<string, unknown> = {
        generationType: dto.generationType,
        model: dto.model ?? 'seedance2-pro',
        resolution: dto.resolution ?? '720p',
        aspectRatio: dto.aspectRatio ?? '9:16',
        duration: dto.duration ?? 5,
        referenceImages: dto.referenceImages ?? [],
        referenceVideo: dto.referenceVideo,
        referenceAudio: dto.referenceAudio,
        firstFrame: dto.firstFrame,
        lastFrame: dto.lastFrame,
        idempotencyKey,
        freezeId: null as string | null,
        billingReservation: null as BillingReservation | null,
        activeGenerationTaskId: null as string | null,
      }

      const work = workRepo.create({
        id: uuidv4(),
        userId,
        type: workType,
        prompt: dto.prompt,
        status: WorkStatus.PENDING,
        cost: points,
        modelConfig,
        templateId: dto.templateId ?? null,
        benchmarkId: dto.benchmarkId ?? null,
        idempotencyKey,
      })

      try {
        await workRepo.save(work)
      } catch (err) {
        const existingWork = await workRepo.findOne({ where: { userId, idempotencyKey } })
        const activeTaskId = existingWork?.modelConfig?.activeGenerationTaskId
        if (existingWork && typeof activeTaskId === 'string' && activeTaskId.length > 0) {
          const result = { workId: existingWork.id, taskId: activeTaskId }
          await cacheIdempotencyRecord(redis, idempotencyKey, result)
          return result
        }
        throw err
      }

      // 冻结积分
      // P0-5: Mock 模式跳过真实 billing 冻结，使用 mock reservation（避免冻结真实积分）
      if (this.isMockMode()) {
        const mockFreezeId = `mock-freeze-${work.id}`
        const reservation = createBillingReservation(points, idempotencyKey, mockFreezeId)
        work.modelConfig = {
          ...work.modelConfig,
          freezeId: reservation.freezeId,
          billingReservation: reservation,
        }
        await workRepo.save(work)
      } else {
        try {
          const freezeResult = await this.billingClient.freeze(
            userId,
            points,
            billingOperationKey(idempotencyKey, 'freeze'),
            work.id,
          )
          const reservation = createBillingReservation(
            points,
            idempotencyKey,
            freezeResult.freezeId,
          )
          work.modelConfig = {
            ...work.modelConfig,
            freezeId: reservation.freezeId,
            billingReservation: reservation,
          }
          await workRepo.save(work)
        } catch (err) {
          await workRepo.update(work.id, {
            status: WorkStatus.FAILED,
            errorLog: { step: 'freeze', message: (err as Error).message },
          })
          throw err
        }
      }

      // 创建 GenerationTask
      const taskRepo = this.dataSource.getRepository(GenerationTask)
      const provider = mapToProvider(this.registry, dto.generationType)
      let task: GenerationTask | undefined
      try {
        task = taskRepo.create({
          id: uuidv4(),
          workId: work.id,
          provider,
          status: GenerationTaskStatus.PENDING,
          attempts: 0,
        })
        await taskRepo.save(task)
        work.modelConfig = {
          ...work.modelConfig,
          activeGenerationTaskId: task.id,
        }
        await workRepo.save(work)
      } catch (err) {
        if (task) {
          await taskRepo.update(task.id, {
            status: GenerationTaskStatus.FAILED,
            error: (err as Error).message,
            completedAt: new Date(),
          })
        }
        await workRepo.update(work.id, {
          status: WorkStatus.FAILED,
          errorLog: { step: 'task_persist', message: (err as Error).message },
        })
        await releaseBillingReservation(
          this.deps(redis),
          work,
          getBillingReservation(work),
          `workId=${work.id}`,
        )
        throw err
      }

      // 创建 GenerationExecution
      const executionId = uuidv4()
      const requestFingerprint = createHash('sha256')
        .update(`${userId}:${dto.generationType}:${dto.prompt}`)
        .digest('hex')
      const executionWorkflowId = this.temporalService.getVideoGenerationWorkflowId({
        workId: work.id,
        generationTaskId: task.id,
      })

      const executionRepo = this.dataSource.getRepository(GenerationExecution)
      const execution = executionRepo.create({
        id: executionId,
        workId: work.id,
        taskId: task.id,
        requestFingerprint,
        workflowId: executionWorkflowId,
        billingOperationId: idempotencyKey,
        reservationId: (work.modelConfig.freezeId as string) ?? '',
        stage: GenerationExecutionStage.INITIATED,
        attempt: 0,
        metadata: { generationType: dto.generationType, points },
      })
      await executionRepo.save(execution)

      work.modelConfig = {
        ...work.modelConfig,
        activeExecutionId: executionId,
      }
      await workRepo.save(work)

      this.logger.log(
        `GenerationExecution 已创建 executionId=${executionId} stage=INITIATED workId=${work.id}`,
      )

      // 启动 Temporal 工作流
      await this.startWorkflow(work, task, dto, idempotencyKey, points)

      // 缓存幂等结果
      const result: CreateGenerationResult = { workId: work.id, taskId: task.id }
      await cacheIdempotencyRecord(redis, idempotencyKey, result)

      // 模板使用次数 +1（非阻塞）
      if (dto.templateId) {
        try {
          await this.templateClient.incrementUseCount(dto.templateId)
        } catch (err) {
          this.logger.warn(
            `模板使用次数 +1 失败 templateId=${dto.templateId}: ${(err as Error).message}`,
          )
        }
      }

      return result
    } finally {
      await releaseOwnedLock(redis, idemLockKey(idempotencyKey), lockToken)
    }
  }

  /**
   * 启动 Temporal 工作流（Mock 模式跳过）
   *
   * 供 create 和 retry 共用。
   */
  async startWorkflow(
    work: Work,
    task: GenerationTask,
    dto: CreateGenerationDto,
    idempotencyKey: string,
    points: number,
  ): Promise<void> {
    const taskRepo = this.dataSource.getRepository(GenerationTask)
    const workRepo = this.dataSource.getRepository(Work)
    const executionRepo = this.dataSource.getRepository(GenerationExecution)

    this.assertGenerationTypeSupported(dto.generationType)

    // Mock 模式：模拟 workflowId，不调用 Temporal
    if (this.isMockMode()) {
      const mockWorkflowId = `mock-video-gen-${work.id}-${task.id}`
      const now = new Date()
      await taskRepo.update(task.id, {
        providerTaskId: mockWorkflowId,
        status: GenerationTaskStatus.COMPLETED,
        startedAt: now,
        completedAt: now,
      })
      const mockResultKey = `mock/results/${work.id}.mp4`
      const mockResultUrl = `https://mock.example.com/results/${work.id}.mp4`
      const mockThumbnailKey = `mock/thumbnails/${work.id}.jpg`
      await workRepo.update(work.id, {
        status: WorkStatus.COMPLETED,
        resultKey: mockResultKey,
        resultUrl: mockResultUrl,
        thumbnailKey: mockThumbnailKey,
      })
      const activeExecutionId = (work.modelConfig.activeExecutionId as string) ?? null
      if (activeExecutionId) {
        await executionRepo.update(activeExecutionId, { stage: GenerationExecutionStage.COMPLETED })
      }
      this.logger.log(`[Mock] 模拟工作流已立即完成 workId=${work.id} taskId=${task.id}`)
      return
    }

    // 真实模式：启动 Temporal 工作流
    const modelConfig: VideoModelConfig = {
      modelId: dto.model ?? 'seedance2-pro',
      duration: (dto.duration ?? 5) as number,
      resolution: dto.resolution ?? '720p',
      aspectRatio: dto.aspectRatio ?? '9:16',
      firstFrameUrl: dto.firstFrame,
      lastFrameUrl: dto.lastFrame,
      referenceUrl: dto.referenceVideo,
    }

    const params: VideoGenParams = {
      workId: work.id,
      generationTaskId: task.id,
      userId: work.userId,
      workType: this.registry.getTemporalWorkType(dto.generationType) as WorkType,
      prompt: dto.prompt,
      modelConfig,
      estimatedCredits: points,
      idempotencyKey,
      billingReservation: getBillingReservation(work),
      enableModeration: true,
      benchmarkId: dto.benchmarkId,
    }

    const workflowId = this.temporalService.getVideoGenerationWorkflowId(params)
    try {
      await taskRepo.update(task.id, {
        providerTaskId: workflowId,
        status: GenerationTaskStatus.PENDING,
      })
      await this.temporalService.startVideoGeneration(params)
      await taskRepo.update(task.id, {
        providerTaskId: workflowId,
        status: GenerationTaskStatus.RUNNING,
        startedAt: new Date(),
      })
      this.logger.log(`工作流已启动 workId=${work.id} workflowId=${workflowId}`)
    } catch (err) {
      this.logger.error(`启动工作流失败 workId=${work.id}: ${(err as Error).message}`)
      let workflowStarted: boolean
      try {
        workflowStarted = await this.temporalService.isWorkflowStarted(workflowId)
      } catch (checkErr) {
        await taskRepo.update(task.id, {
          providerTaskId: workflowId,
          status: GenerationTaskStatus.PENDING,
          error: `工作流启动状态未确认: ${(checkErr as Error).message}`,
        })
        await workRepo.update(work.id, {
          status: WorkStatus.PENDING,
          errorLog: { step: 'workflow_start_unknown', message: (err as Error).message },
        })
        const activeExecId = (work.modelConfig.activeExecutionId as string) ?? null
        if (activeExecId) {
          await executionRepo.update(activeExecId, {
            stage: GenerationExecutionStage.WORKFLOW_START_UNKNOWN,
          })
        }
        throw BusinessException.taskFailed(`工作流启动状态未确认: ${(err as Error).message}`)
      }

      if (workflowStarted) {
        await taskRepo.update(task.id, {
          providerTaskId: workflowId,
          status: GenerationTaskStatus.RUNNING,
          startedAt: new Date(),
        })
        this.logger.warn(`工作流启动响应丢失但服务端已存在 workflowId=${workflowId}`)
        return
      }

      // Temporal 明确确认工作流不存在，才可标记失败并释放积分
      await taskRepo.update(task.id, {
        status: GenerationTaskStatus.FAILED,
        error: (err as Error).message,
      })
      await workRepo.update(work.id, {
        status: WorkStatus.FAILED,
        errorLog: { step: 'workflow_start', message: (err as Error).message },
      })
      const failedExecId = (work.modelConfig.activeExecutionId as string) ?? null
      if (failedExecId) {
        await executionRepo.update(failedExecId, { stage: GenerationExecutionStage.FAILED })
      }
      await releaseBillingReservation(
        {
          redis: null as never,
          dataSource: this.dataSource,
          billingClient: this.billingClient,
          templateClient: null as never,
        },
        work,
        getBillingReservation(work),
        `workId=${work.id}`,
      )
      throw BusinessException.taskFailed(`工作流启动失败: ${(err as Error).message}`)
    }
  }
}
