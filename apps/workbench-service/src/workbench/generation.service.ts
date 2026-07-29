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
 * Mock 模式：TEMPORAL_MOCK_MODE=true 时跳过 Temporal 调用，模拟 workflowId
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DataSource } from 'typeorm'
import Redis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import { BusinessException, generateIdempotencyKey } from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
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
  // 文本/图片生成无对应视频工作流，默认走 TEXT_TO_VIDEO（Mock 模式下不启动）
  [GenerationType.TEXT_GENERATE]: TemporalWorkType.TEXT_TO_VIDEO,
  [GenerationType.IMAGE_GENERATE]: TemporalWorkType.IMAGE_TO_VIDEO,
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name)

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(DATABASE_CONNECTIONS.MAIN)
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
   *  6. 启动 Temporal 工作流（Mock 模式跳过）
   *  7. 缓存幂等结果
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

    // 3. 计算积分
    const points = calculatePoints(dto.generationType, {
      resolution: dto.resolution as VideoResolution | undefined,
      duration: dto.duration as VideoDuration | undefined,
    })

    if (points <= 0) {
      throw BusinessException.validationError('无法计算积分，请检查生成参数')
    }

    // 4. 创建 Work（status=PENDING）
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
    })
    await workRepo.save(work)

    // 5. 调用 billing-service 冻结积分
    try {
      const freezeResult = await this.billingClient.freeze(userId, points, idempotencyKey, work.id)
      // 记录 freezeId 到 modelConfig
      work.modelConfig.freezeId = freezeResult.freezeId
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

    // 6. 创建 GenerationTask
    const taskRepo = this.dataSource.getRepository(GenerationTask)
    const provider = this.mapToProvider(dto.generationType)
    const task = taskRepo.create({
      id: uuidv4(),
      workId: work.id,
      provider,
      status: GenerationTaskStatus.PENDING,
      attempts: 0,
    })
    await taskRepo.save(task)

    // 7. 启动 Temporal 工作流
    await this.startWorkflow(work, task, dto, idempotencyKey, points)

    // 8. 缓存幂等结果
    const result: CreateGenerationResult = {
      workId: work.id,
      taskId: task.id,
    }
    await this.cacheIdempotencyRecord(idempotencyKey, result)

    // 9. 基于模板创作：模板使用次数 +1（非阻塞，失败仅记录日志）
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

    // 1. 取消 Temporal 工作流
    if (!this.isMockMode() && task.providerTaskId) {
      try {
        await this.temporalService.cancelWorkflow(task.providerTaskId)
      } catch (err) {
        // 工作流可能已完成或不存在，记录日志但不阻塞取消流程
        this.logger.warn(
          `取消工作流失败（可能已结束）: ${task.providerTaskId} - ${(err as Error).message}`,
        )
      }
    }

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

    // 4. 释放冻结积分
    const freezeId = work.modelConfig?.freezeId as string | null
    if (freezeId) {
      const releaseKey = generateIdempotencyKey(userId, 'cancel_release', {
        taskId,
        freezeId,
      })
      try {
        await this.billingClient.release(userId, work.cost, releaseKey, freezeId)
      } catch (err) {
        this.logger.error(`释放积分失败: taskId=${taskId} - ${(err as Error).message}`)
      }
    }
  }

  // -------------------- 重试任务 --------------------

  /**
   * 重试任务
   *
   * 流程：
   *  1. 查询原任务 + 校验所有权
   *  2. 创建新 GenerationTask（attempts = 原 attempts + 1）
   *  3. 重启 Temporal 工作流（不重复冻结积分，复用原冻结）
   *  4. 更新 Work 状态为 PENDING
   */
  async retry(userId: string, taskId: string): Promise<CreateGenerationResult> {
    const { task, work } = await this.findOne(userId, taskId)

    // 仅 FAILED / CANCELLED 状态可重试
    if (
      task.status !== GenerationTaskStatus.FAILED &&
      work.status !== WorkStatus.CANCELLED &&
      work.status !== WorkStatus.FAILED
    ) {
      throw BusinessException.validationError(
        `任务当前状态为 ${task.status} / Work ${work.status}，无法重试`,
      )
    }

    const taskRepo = this.dataSource.getRepository(GenerationTask)
    const workRepo = this.dataSource.getRepository(Work)

    // 1. 创建新 GenerationTask（attempts 递增）
    const newTask = taskRepo.create({
      id: uuidv4(),
      workId: work.id,
      provider: task.provider,
      status: GenerationTaskStatus.PENDING,
      attempts: task.attempts + 1,
    })
    await taskRepo.save(newTask)

    // 2. 更新 Work 状态为 PENDING
    await workRepo.update(work.id, {
      status: WorkStatus.PENDING,
      errorLog: null,
    })

    // 3. 重启 Temporal 工作流（复用原冻结积分）
    const dto = this.buildDtoFromWork(work)
    const idempotencyKey = generateIdempotencyKey(userId, 'retry', {
      taskId: newTask.id,
      workId: work.id,
    })
    const points = work.cost
    await this.startWorkflow(work, newTask, dto, idempotencyKey, points)

    return { workId: work.id, taskId: newTask.id }
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

    // Mock 模式：模拟 workflowId，不调用 Temporal
    if (this.isMockMode()) {
      const mockWorkflowId = `mock-video-gen-${work.id}`
      await taskRepo.update(task.id, {
        providerTaskId: mockWorkflowId,
        status: GenerationTaskStatus.RUNNING,
        startedAt: new Date(),
      })
      this.logger.log(`[Mock] 模拟工作流已启动 workId=${work.id} taskId=${task.id}`)
      return
    }

    // 文本/图片生成无视频工作流，Mock 处理
    if (!isVideoType(dto.generationType)) {
      const mockWorkflowId = `mock-${work.id}`
      await taskRepo.update(task.id, {
        providerTaskId: mockWorkflowId,
        status: GenerationTaskStatus.RUNNING,
        startedAt: new Date(),
      })
      this.logger.log(`非视频类型，直接标记运行中 workId=${work.id} taskId=${task.id}`)
      return
    }

    // 启动 Temporal 视频生成工作流
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
      userId: work.userId,
      workType: TEMPORAL_WORK_TYPE_MAP[dto.generationType],
      prompt: dto.prompt,
      modelConfig,
      estimatedCredits: points,
      idempotencyKey,
      // 默认启用内容安全审核：审核不通过将自动退款并标记任务失败
      enableModeration: true,
    }

    try {
      const workflowId = await this.temporalService.startVideoGeneration(params)
      await taskRepo.update(task.id, {
        providerTaskId: workflowId,
        status: GenerationTaskStatus.RUNNING,
        startedAt: new Date(),
      })
      this.logger.log(`工作流已启动 workId=${work.id} workflowId=${workflowId}`)
    } catch (err) {
      // 工作流启动失败：标记任务失败 + 释放积分
      this.logger.error(`启动工作流失败 workId=${work.id}: ${(err as Error).message}`)
      await taskRepo.update(task.id, {
        status: GenerationTaskStatus.FAILED,
        error: (err as Error).message,
      })
      // 释放冻结积分
      const freezeId = work.modelConfig?.freezeId as string | null
      if (freezeId) {
        const releaseKey = generateIdempotencyKey(work.userId, 'wf_fail_release', {
          workId: work.id,
          freezeId,
        })
        try {
          await this.billingClient.release(work.userId, work.cost, releaseKey, freezeId)
        } catch (releaseErr) {
          this.logger.error(`释放积分失败 workId=${work.id}: ${(releaseErr as Error).message}`)
        }
      }
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
