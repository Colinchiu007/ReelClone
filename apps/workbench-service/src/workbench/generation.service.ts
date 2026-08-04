/**
 * GenerationService — 生成任务业务编排（薄 Facade）
 *
 * 职责：
 *  1. create: 委托 GenerationCreateHandler（幂等 → 积分冻结 → Work → Task → Execution → Temporal）
 *  2. findAll: 分页查询用户任务列表（直接查询，无需 handler）
 *  3. findOne: 查询单个任务详情（直接查询，无需 handler）
 *  4. cancel: 委托 GenerationCancelHandler（Temporal 取消 + 状态更新 + 释放冻结积分）
 *  5. retry: 委托 GenerationRetryHandler（新 Task + 重新冻结 + 重启工作流）
 *
 * 拆分策略：每个 use case 有独立 handler 文件，本文件仅做编排和查询委托。
 */
import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import Redis from 'ioredis'
import { DATABASE_CONNECTIONS, GenerationTask, REDIS_CLIENT } from '@reelclone/database'
import { CapabilityRegistry, CAPABILITY_REGISTRY } from '@reelclone/capability'
import { BillingClient } from './billing.client'
import { TemplateClient } from './template.client'
import { TemporalService } from '@reelclone/temporal'
import { ConfigService } from '@nestjs/config'
import { type CreateGenerationDto } from './dto/create-generation.dto'
import { type ListGenerationsDto } from './dto/list-generations.dto'
import {
  findOneTask,
  type PaginatedTasks,
  type TaskDetail,
  type CreateGenerationResult,
} from './generation/shared'
import { GenerationCreateHandler } from './generation/create.handler'
import { GenerationCancelHandler } from './generation/cancel.handler'
import { GenerationRetryHandler } from './generation/retry.handler'

@Injectable()
export class GenerationService {
  private readonly createHandler: GenerationCreateHandler
  private readonly cancelHandler: GenerationCancelHandler
  private readonly retryHandler: GenerationRetryHandler

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource(DATABASE_CONNECTIONS.MAIN)
    private readonly dataSource: DataSource,
    billingClient: BillingClient,
    templateClient: TemplateClient,
    temporalService: TemporalService,
    configService: ConfigService,
    @Inject(CAPABILITY_REGISTRY) registry: CapabilityRegistry,
  ) {
    this.createHandler = new GenerationCreateHandler(
      dataSource,
      billingClient,
      templateClient,
      temporalService,
      configService,
      registry,
    )
    this.cancelHandler = new GenerationCancelHandler(
      dataSource,
      billingClient,
      temporalService,
      configService,
    )
    this.retryHandler = new GenerationRetryHandler(
      dataSource,
      billingClient,
      configService,
      this.createHandler,
      registry,
    )
  }

  // -------------------- 创建任务 --------------------

  async create(userId: string, dto: CreateGenerationDto): Promise<CreateGenerationResult> {
    return this.createHandler.create(userId, dto, this.redis)
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

    if (dto.status) {
      qb.andWhere('task.status = :status', { status: dto.status })
    }

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

  async findOne(userId: string, taskId: string): Promise<TaskDetail> {
    return findOneTask(this.dataSource, userId, taskId)
  }

  // -------------------- 取消任务 --------------------

  async cancel(userId: string, taskId: string): Promise<void> {
    return this.cancelHandler.cancel(userId, taskId)
  }

  // -------------------- 重试任务 --------------------

  async retry(userId: string, taskId: string): Promise<CreateGenerationResult> {
    return this.retryHandler.retry(userId, taskId, this.redis)
  }
}
