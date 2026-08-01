/**
 * GenerationService — 生成任务业务编排
 *
 * 职责：
 *  1. create: 计算积分 → 冻结 → 创建 Work + GenerationTask → 启动 Temporal 工作流
 *  2. findAll: 分页查询用户任务列表（关联 Work 过滤 userId）
 *  3. findOne: 查询单个任务详情（校验所有权）
 *  4. cancel: 取消 Temporal 工作流 + 更新状态 + 释放冻结积分
 *  5. retry: 复用原 Work，创建新 GenerationTask，重启工作流（不重复冻结积分）
 *
 * 幂等性：通过 Redis 缓存 idempotencyKey → { workId, taskId }，重复请求返回已有结果
 * Mock 模式：TEMPORAL_MOCK_MODE=true 时跳过 Temporal 调用，模拟 workflowId；真实模式仅支持已接入 Provider 的视频生成。
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
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
  GenerationProvider,
  GenerationTask,
  GenerationTaskStatus,
  REDIS_CLIENT,
  Work,
  WorkStatus,
  WorkType,
} from '@reelclone/database'
import { TemporalService } from '@reelclone/temporal'
import {
  type VideoGenParams,
  type BillingReservation,
  type VideoModelConfig,
  WorkType as TemporalWorkType,
} from '@reelclone/temporal'
import { BillingClient } from './billing.client'
import { TemplateClient } from './template.client'
import {
  calculatePoints,
  isVideoType,
  type VideoDuration,
  type VideoResolution,
} from './points-calculator.util'
import { type CreateGenerationDto, GenerationType } from './dto/create-generation.dto'
import { type ListGenerationsDto } from './dto/list-generations.dto'

/** 幂等结果缓存 TTL（24h） */
const IDEMPOTENCY_TTL = 86400

/** 幂等 Redis key 前缀 */
const idemKey = (key: string) => `workbench:idem:${key}`

/** 生成请求锁，避免 Redis 缓存写入前的并发请求重复创建 Work。 */
const idemLockKey = (key: string) => `workbench:idem-lock:${key}`
const IDEMPOTENCY_LOCK_TTL = 5 * 60

/** 重试锁独立于创建请求幂等锁，避免同一终态 Work 并发创建两条新任务。 */
const retryLockKey = (taskId: string) => `workbench:retry-lock:${taskId}`
const RETRY_LOCK_TTL = 5 * 60
const RELEASE_OWNED_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

/** 幂等缓存记录 */
interface IdempotencyRecord {
  workId: string
  taskId: string
}

/** 创建任务返回 */
export interface CreateGenerationResult {
  workId: string
  taskId: string
}

/** 任务详情返回（含 Work 信息） */
export interface TaskDetail {
  task: GenerationTask
  work: Work
}

/** 分页返回 */
export interface PaginatedTasks {
  list: GenerationTask[]
  page: number
  pageSize: number
  total: number
}

/** DTO 生成类型 → Temporal WorkType 映射 */
const TEMPORAL_WORK_TYPE_MAP: Record<GenerationType, TemporalWorkType> = {
  [GenerationType.TEXT_TO_VIDEO]: TemporalWorkType.TEXT_TO_VIDEO,
  [GenerationType.IMAGE_TO_VIDEO_FIRST]: TemporalWorkType.IMAGE_TO_VIDEO,
  [GenerationType.IMAGE_TO_VIDEO_FIRST_LAST]: TemporalWorkType.IMAGE_TO_VIDEO_WITH_TAIL,
  [GenerationType.THREE_D_MODELING]: TemporalWorkType.REFERENCE_TO_VIDEO,
  [GenerationType.EDIT_VIDEO]: TemporalWorkType.EDIT_VIDEO,
  [GenerationType.EXTEND_VIDEO]: TemporalWorkType.EXTEND_VIDEO,
  // 文本/图片生成无对应视频工作流；仅 Mock 模式会在映射前返回。
  [GenerationType.TEXT_GENERATE]: TemporalWorkType.TEXT_TO_VIDEO,
  [GenerationType.IMAGE_GENERATE]: TemporalWorkType.IMAGE_TO_VIDEO,
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly templateClient: TemplateClient,
    private readonly temporalService: TemporalService,
    private readonly configService: ConfigService,
  ) {}

  /** 是否为 Temporal Mock 模式 */
  private isMockMode(): boolean {
    return this.configService.get<string>('TEMPORAL_MOCK_MODE') === 'true'
  }

  /**
   * 防止真实模式把尚未接入 Provider 的类型伪装成已完成任务。
   * 必须在创建记录或冻结积分前调用，重试时也必须在改变状态前调用。
   */
  private assertGenerationTypeSupported(type: GenerationType): void {
    if (!this.isMockMode() && !isVideoType(type)) {
      throw BusinessException.validationError(
        '当前仅支持视频生成，文本和图片生成需在接入真实 Provider 后启用',
        { field: 'generationType', value: type },
      )
    }
  }

  // -------------------- 创建任务 --------------------

  /**
   * 提交生成任务
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
  async create(userId: string, dto: CreateGenerationDto): Promise<CreateGenerationResult> {
    // 1. 幂等键
    const idempotencyKey =
      dto.idempotencyKey ||
      generateIdempotencyKey(userId, 'create_generation', {
        generationType: dto.generationType,
        prompt: dto.prompt,
      })

    // 2. 幂等检查：Redis 命中则返回已有 work
    const existing = await this.getIdempotencyRecord(idempotencyKey)
    if (existing) {
      this.logger.log(`幂等命中，返回已有任务 workId=${existing.workId}`)
      return existing
    }

    // 3. 在任意副作用前获取请求锁；数据库唯一键是 Redis 不可用或锁过期时的兜底。
    const lockToken = uuidv4()
    const lockAcquired = await this.redis.set(
      idemLockKey(idempotencyKey),
      lockToken,
      'EX',
      IDEMPOTENCY_LOCK_TTL,
      'NX',
    )
    if (!lockAcquired) {
      const retryRecord = await this.getIdempotencyRecord(idempotencyKey)
      if (retryRecord) return retryRecord
      throw BusinessException.rateLimited('请求正在处理中，请稍后重试', { idempotencyKey })
    }

    try {
      // 获锁后再次读取，避免前一个请求在首次读取与抢锁间完成。
      const lockedRecord = await this.getIdempotencyRecord(idempotencyKey)
      if (lockedRecord) return lockedRecord

      // 4. 在创建记录或冻结积分前确认真实 Provider 能处理该类型
      this.assertGenerationTypeSupported(dto.generationType)

      // 5. 计算积分
      const points = calculatePoints(dto.generationType, {
        resolution: dto.resolution as VideoResolution | undefined,
        duration: dto.duration as VideoDuration | undefined,
      })

      if (points <= 0) {
        throw BusinessException.validationError('无法计算积分，请检查生成参数')
      }

      // 6. 创建 Work（status=PENDING）
      const workRepo = this.dataSource.getRepository(Work)
      const workType = this.mapToWorkType(dto.generationType)

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
          await this.cacheIdempotencyRecord(idempotencyKey, result)
          return result
        }
        throw err
      }

      // 7. 调用 billing-service 冻结积分
      try {
        const freezeResult = await this.billingClient.freeze(
          userId,
          points,
          this.billingOperationKey(idempotencyKey, 'freeze'),
          work.id,
        )
        const reservation = this.createBillingReservation(
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
        // 冻结失败：标记 Work 为 FAILED
        await workRepo.update(work.id, {
          status: WorkStatus.FAILED,
          errorLog: {
            step: 'freeze',
            message: (err as Error).message,
          },
        })
        throw err
      }

      // 8. 创建 GenerationTask
      const taskRepo = this.dataSource.getRepository(GenerationTask)
      const provider = this.mapToProvider(dto.generationType)
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
        await this.releaseBillingReservation(
          work,
          this.getBillingReservation(work),
          `workId=${work.id}`,
        )
        throw err
      }

      // 9. 创建 GenerationExecution（durable execution 权威记录）
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

      // 10. 启动 Temporal 工作流
      await this.startWorkflow(work, task, dto, idempotencyKey, points)

      // 11. 缓存幂等结果
      const result: CreateGenerationResult = {
        workId: work.id,
        taskId: task.id,
      }
      await this.cacheIdempotencyRecord(idempotencyKey, result)

      // 12. 基于模板创作：模板使用次数 +1（非阻塞，失败仅记录日志）
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
      await this.releaseOwnedLock(idemLockKey(idempotencyKey), lockToken)
    }
  }

  // -------------------- 查询：列表 --------------------

  /**
   * 分页查询用户任务列表
   * 关联 Work 表过滤 userId，支持按状态/类型筛选
   */
  async findAll(userId: string, dto: ListGenerationsDto): Promise<PaginatedTasks> {
    const taskRepo = this.dataSource.getRepository(GenerationTask)

    const qb = taskRepo
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.work', 'work')
      .where('work.userId = :userId', { userId })

    // 状态筛选
    if (dto.status) {
      qb.andWhere('task.status = :status', { status: dto.status })
    }

    // 生成类型筛选（存储在 modelConfig.generationType）
    if (dto.generationType) {
      qb.andWhere("work.modelConfig ->> 'generationType' = :genType", {
        genType: dto.generationType,
      })
    }

    qb.orderBy('task.createdAt', 'DESC')

    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  // -------------------- 查询：详情 --------------------

  /**
   * 查询单个任务详情（校验所有权）
   */
  async findOne(userId: string, taskId: string): Promise<TaskDetail> {
    const taskRepo = this.dataSource.getRepository(GenerationTask)

    const task = await taskRepo.findOne({
      where: { id: taskId },
      relations: ['work'],
    })

    if (!task) {
      throw BusinessException.notFound('任务', { taskId })
    }

    if (task.work.userId !== userId) {
      throw BusinessException.forbidden('无权访问此任务', { taskId })
    }

    return { task, work: task.work }
  }

  // -------------------- 取消任务 --------------------

  /**
   * 取消任务
   *
   * 流程：
   *  1. 查询任务 + 校验所有权
   *  2. 调用 Temporal cancelWorkflow（非 Mock 模式）
   *  3. 更新 Task 状态为 FAILED（GenerationTaskStatus 无 CANCELLED）
   *  4. 更新 Work 状态为 CANCELLED
   *  5. 调用 billing-service 释放冻结积分
   */
  async cancel(userId: string, taskId: string): Promise<void> {
    const { task, work } = await this.findOne(userId, taskId)

    // 仅 PENDING / RUNNING 状态可取消
    if (
      task.status !== GenerationTaskStatus.PENDING &&
      task.status !== GenerationTaskStatus.RUNNING
    ) {
      throw BusinessException.validationError(`任务当前状态为 ${task.status}，无法取消`)
    }

    const taskRepo = this.dataSource.getRepository(GenerationTask)
    const workRepo = this.dataSource.getRepository(Work)
    const executionRepo = this.dataSource.getRepository(GenerationExecution)

    // 1. 真实模式只提交 Temporal 取消请求。退款与最终状态必须等待工作流
    // 在 Provider 侧确认取消后，由不可取消补偿路径完成。
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
        // 未确认取消成功前不得退款，避免 Provider 继续生成却不再扣费。
        this.logger.error(`取消工作流失败 taskId=${taskId}: ${(err as Error).message}`)
        throw BusinessException.taskFailed(`取消工作流失败，请稍后重试: ${(err as Error).message}`)
      }
      // C1.2: 更新 GenerationExecution 到 PROVIDER_CANCEL_PENDING（等待 Provider 确认）
      const activeExecId = (work.modelConfig.activeExecutionId as string) ?? null
      if (activeExecId) {
        await executionRepo.update(activeExecId, {
          stage: GenerationExecutionStage.PROVIDER_CANCEL_PENDING,
        })
      }
      this.logger.log(`已提交取消请求 taskId=${taskId}，等待 Provider 确认后结算`)
      return
    }

    // Mock 模式没有真实 Provider，保持同步取消语义以便本地联调。
    // 2. 更新 Task 状态
    await taskRepo.update(task.id, {
      status: GenerationTaskStatus.FAILED,
      error: '用户取消',
      completedAt: new Date(),
    })

    // 3. 更新 Work 状态
    await workRepo.update(work.id, {
      status: WorkStatus.CANCELLED,
    })

    // C1.2: 更新 GenerationExecution 到 CANCELED（Mock 模式同步完成）
    const mockExecId = (work.modelConfig.activeExecutionId as string) ?? null
    if (mockExecId) {
      await executionRepo.update(mockExecId, {
        stage: GenerationExecutionStage.CANCELED,
      })
    }

    // 4. API 取消与工作流补偿共用同一个 release key。
    await this.releaseBillingReservation(work, this.getBillingReservation(work), `taskId=${taskId}`)
  }

  // -------------------- 重试任务 --------------------

  /**
   * 重试任务
   *
   * 流程：
   *  1. 查询原任务 + 校验所有权
   *  2. 创建新 GenerationTask（attempts = 原 attempts + 1）
   *  3. 重新冻结积分并重启独立的 Temporal 工作流
   *  4. 更新 Work 状态为 PENDING
   */
  async retry(userId: string, taskId: string): Promise<CreateGenerationResult> {
    const lockToken = uuidv4()
    const lockAcquired = await this.redis.set(
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
      const { task, work: requestedWork } = await this.findOne(userId, taskId)

      // 原任务和 Work 都必须已终态；旧条件用 && 会错误放行“任务未失败但 Work 已失败”。
      if (
        task.status !== GenerationTaskStatus.FAILED ||
        (requestedWork.status !== WorkStatus.CANCELLED &&
          requestedWork.status !== WorkStatus.FAILED)
      ) {
        throw BusinessException.validationError(
          `任务当前状态为 ${task.status} / Work ${requestedWork.status}，无法重试`,
        )
      }

      const dto = this.buildDtoFromWork(requestedWork)
      this.assertGenerationTypeSupported(dto.generationType)

      // 在 main 库事务中锁定 Work、创建新 Task 并声明新的 activeGenerationTaskId。
      // 这使第二个并发重试在 Redis 锁超时或失效后也会看到 PENDING，而不能再冻结积分。
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
          this.billingOperationKey(retryIdempotencyKey, 'freeze'),
          work.id,
        )
        reservation = this.createBillingReservation(
          points,
          retryIdempotencyKey,
          retryFreeze.freezeId,
        )
        work.modelConfig = {
          ...(work.modelConfig ?? {}),
          idempotencyKey: retryIdempotencyKey,
          freezeId: reservation.freezeId,
          billingReservation: reservation,
          activeGenerationTaskId: newTask.id,
        }
        await workRepo.save(work)
        await this.startWorkflow(work, newTask, dto, retryIdempotencyKey, points)
      } catch (err) {
        await taskRepo.update(newTask.id, {
          status: GenerationTaskStatus.FAILED,
          error: (err as Error).message,
          completedAt: new Date(),
        })
        // 当前请求仍持有 retry lock，且 Work 在事务内声明了本 Task 为 active，故此处
        // 回退为 FAILED 不会覆盖另一轮重试。
        await workRepo.update(work.id, {
          status: WorkStatus.FAILED,
          errorLog: { step: 'retry', message: (err as Error).message },
        })
        if (reservation) {
          await this.releaseBillingReservation(work, reservation, `retry taskId=${newTask.id}`)
        }
        throw err
      }

      return { workId: work.id, taskId: newTask.id }
    } finally {
      await this.releaseOwnedLock(retryLockKey(taskId), lockToken)
    }
  }

  // -------------------- 内部方法 --------------------

  /** 启动 Temporal 工作流（Mock 模式跳过） */
  private async startWorkflow(
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

    // Mock 模式：模拟 workflowId，不调用 Temporal，并立即标记完成
    if (this.isMockMode()) {
      const mockWorkflowId = `mock-video-gen-${work.id}-${task.id}`
      const now = new Date()
      await taskRepo.update(task.id, {
        providerTaskId: mockWorkflowId,
        status: GenerationTaskStatus.COMPLETED,
        startedAt: now,
        completedAt: now,
      })
      // Mock 模式下立即把 Work 标记为 COMPLETED，写入 mock 结果 URL
      const mockResultKey = `mock/results/${work.id}.mp4`
      const mockResultUrl = `https://mock.example.com/results/${work.id}.mp4`
      const mockThumbnailKey = `mock/thumbnails/${work.id}.jpg`
      await workRepo.update(work.id, {
        status: WorkStatus.COMPLETED,
        resultKey: mockResultKey,
        resultUrl: mockResultUrl,
        thumbnailKey: mockThumbnailKey,
      })
      // C1: 更新 GenerationExecution 到 COMPLETED（Mock 模式直接完成）
      const activeExecutionId = (work.modelConfig.activeExecutionId as string) ?? null
      if (activeExecutionId) {
        await executionRepo.update(activeExecutionId, {
          stage: GenerationExecutionStage.COMPLETED,
        })
      }
      this.logger.log(`[Mock] 模拟工作流已立即完成 workId=${work.id} taskId=${task.id}`)
      return
    }

    // 启动 Temporal 视频生成工作流。先持久化确定性 workflow ID，令并发取消
    // 能识别到“已开始但客户端响应可能丢失”的执行。
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
      workType: TEMPORAL_WORK_TYPE_MAP[dto.generationType],
      prompt: dto.prompt,
      modelConfig,
      estimatedCredits: points,
      idempotencyKey,
      billingReservation: this.getBillingReservation(work),
      // 默认启用内容安全审核：审核不通过将自动退款并标记任务失败
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
        // 请求是否已被 Temporal 接受尚不确定，保留预留并让用户稍后查询或人工对账。
        await taskRepo.update(task.id, {
          providerTaskId: workflowId,
          status: GenerationTaskStatus.PENDING,
          error: `工作流启动状态未确认: ${(checkErr as Error).message}`,
        })
        await workRepo.update(work.id, {
          status: WorkStatus.PENDING,
          errorLog: { step: 'workflow_start_unknown', message: (err as Error).message },
        })
        // C1: 更新 GenerationExecution 到 WORKFLOW_START_UNKNOWN
        const activeExecId = (work.modelConfig.activeExecutionId as string) ?? null
        if (activeExecId) {
          await executionRepo.update(activeExecId, {
            stage: GenerationExecutionStage.WORKFLOW_START_UNKNOWN,
          })
        }
        throw BusinessException.taskFailed(`工作流启动状态未确认: ${(err as Error).message}`)
      }

      if (workflowStarted) {
        // start 的响应可能在网络中丢失；服务端已有工作流时不得释放该预留。
        await taskRepo.update(task.id, {
          providerTaskId: workflowId,
          status: GenerationTaskStatus.RUNNING,
          startedAt: new Date(),
        })
        this.logger.warn(`工作流启动响应丢失但服务端已存在 workflowId=${workflowId}`)
        return
      }

      // Temporal 明确确认工作流不存在，才可标记失败并释放积分。
      await taskRepo.update(task.id, {
        status: GenerationTaskStatus.FAILED,
        error: (err as Error).message,
      })
      // 释放冻结积分
      await workRepo.update(work.id, {
        status: WorkStatus.FAILED,
        errorLog: { step: 'workflow_start', message: (err as Error).message },
      })
      // C1: 更新 GenerationExecution 到 FAILED
      const failedExecId = (work.modelConfig.activeExecutionId as string) ?? null
      if (failedExecId) {
        await executionRepo.update(failedExecId, {
          stage: GenerationExecutionStage.FAILED,
        })
      }
      await this.releaseBillingReservation(
        work,
        this.getBillingReservation(work),
        `workId=${work.id}`,
      )
      throw BusinessException.taskFailed(`工作流启动失败: ${(err as Error).message}`)
    }
  }

  /** DTO 生成类型 → Work 实体类型映射 */
  private mapToWorkType(type: GenerationType): WorkType {
    switch (type) {
      case GenerationType.TEXT_GENERATE:
        return WorkType.TEXT
      case GenerationType.IMAGE_GENERATE:
        return WorkType.IMAGE
      default:
        return WorkType.VIDEO
    }
  }

  /** DTO 生成类型 → GenerationProvider 映射 */
  private mapToProvider(type: GenerationType): GenerationProvider {
    if (isVideoType(type)) {
      return GenerationProvider.SEEDANCE
    }
    return GenerationProvider.MOCK
  }

  /** 从 Work.modelConfig 反向构建 DTO（用于重试） */
  private buildDtoFromWork(work: Work): CreateGenerationDto {
    const cfg = work.modelConfig ?? {}
    return {
      generationType: (cfg.generationType as GenerationType) ?? GenerationType.TEXT_TO_VIDEO,
      prompt: work.prompt ?? '',
      model: cfg.model as string | undefined,
      resolution: cfg.resolution as CreateGenerationDto['resolution'],
      aspectRatio: cfg.aspectRatio as CreateGenerationDto['aspectRatio'],
      duration: cfg.duration as CreateGenerationDto['duration'],
      referenceImages: cfg.referenceImages as string[] | undefined,
      referenceVideo: cfg.referenceVideo as string | undefined,
      referenceAudio: cfg.referenceAudio as string | undefined,
      firstFrame: cfg.firstFrame as string | undefined,
      lastFrame: cfg.lastFrame as string | undefined,
      templateId: work.templateId ?? undefined,
      benchmarkId: work.benchmarkId ?? undefined,
    }
  }

  /** 为一次生成操作创建稳定的三阶段账务键。 */
  private createBillingReservation(
    amount: number,
    idempotencyKey: string,
    freezeId: string,
  ): BillingReservation {
    return {
      freezeId,
      amount,
      billingMode: 'v2',
      settleIdempotencyKey: this.billingOperationKey(idempotencyKey, 'settle'),
      releaseIdempotencyKey: this.billingOperationKey(idempotencyKey, 'release'),
    }
  }

  private billingOperationKey(
    idempotencyKey: string,
    operation: 'freeze' | 'settle' | 'release',
  ): string {
    return `${idempotencyKey}:${operation}`
  }

  /** 读取当前 Work 持久化的账务预留，兼容已有冻结流水。 */
  private getBillingReservation(work: Work): BillingReservation {
    const cfg = (work.modelConfig ?? {}) as Record<string, unknown>
    const stored = cfg.billingReservation
    if (this.isBillingReservation(stored)) {
      return stored
    }

    const freezeId = typeof cfg.freezeId === 'string' ? cfg.freezeId : undefined
    const idempotencyKey = typeof cfg.idempotencyKey === 'string' ? cfg.idempotencyKey : undefined
    if (freezeId && idempotencyKey) {
      return this.createBillingReservation(work.cost, idempotencyKey, freezeId)
    }

    throw BusinessException.taskFailed('缺少可释放的积分预留')
  }

  private isBillingReservation(value: unknown): value is BillingReservation {
    if (!value || typeof value !== 'object') return false
    const reservation = value as Partial<BillingReservation>
    return (
      typeof reservation.freezeId === 'string' &&
      typeof reservation.amount === 'number' &&
      typeof reservation.settleIdempotencyKey === 'string' &&
      typeof reservation.releaseIdempotencyKey === 'string'
    )
  }

  private async releaseBillingReservation(
    work: Work,
    reservation: BillingReservation,
    context: string,
  ): Promise<void> {
    try {
      await this.billingClient.release(
        work.userId,
        reservation.amount,
        reservation.releaseIdempotencyKey,
        reservation.freezeId,
        reservation.billingMode ?? 'v2',
      )
    } catch (err) {
      const message = (err as Error).message
      this.logger.error(`释放积分失败 ${context}: ${message}`)
      await this.dataSource.getRepository(Work).update(work.id, {
        status: WorkStatus.FAILED,
        errorLog: {
          step: 'billing_release_pending',
          message,
          context,
        },
      })
      throw err
    }
  }

  /** 仅释放当前请求持有的 Redis 锁，防止过期请求删除后继请求的新锁。 */
  private async releaseOwnedLock(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_OWNED_LOCK_SCRIPT, 1, key, token)
    } catch (err) {
      // 锁会通过 TTL 自然过期；这里不能退化为 DEL，否则会重新引入误删新锁的竞态。
      this.logger.warn(`释放 Redis 锁失败 key=${key}: ${(err as Error).message}`)
    }
  }

  /** 读取幂等缓存记录 */
  private async getIdempotencyRecord(key: string): Promise<CreateGenerationResult | null> {
    const cached = await this.redis.get(idemKey(key))
    if (cached) {
      try {
        return JSON.parse(cached) as CreateGenerationResult
      } catch {
        return null
      }
    }
    return null
  }

  /** 写入幂等缓存记录 */
  private async cacheIdempotencyRecord(key: string, record: IdempotencyRecord): Promise<void> {
    await this.redis.set(idemKey(key), JSON.stringify(record), 'EX', IDEMPOTENCY_TTL)
  }
}
