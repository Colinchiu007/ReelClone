/**
 * BenchmarkService — 对标解析业务编排
 *
 * 职责：
 *  1. create: 校验 URL → 识别平台 → 幂等检查 → 创建记录 → 冻结积分 → 启动 Temporal 工作流
 *  2. findAll: 分页查询用户对标解析历史（支持平台/状态筛选）
 *  3. findOne: 查询单条详情（校验所有权）
 *  4. cancel: 取消工作流 → 更新状态 → 释放积分
 *  5. clone: 基于已完成的对标解析结果生成一键复刻建议参数
 *
 * 幂等性：
 *  - 提交任务时使用 idempotencyKey，重复请求返回已有 benchmark
 *  - Redis 缓存键：benchmark:idem:{idempotencyKey}（TTL 24h）
 *
 * B3 重构（V2 CreditOperation 架构）：
 *  - freezeId 持久化到 benchmark 库（DB + Redis 双写），替代 Redis-only 存储
 *  - release 使用独立的 freezeIdempotencyKey，不再复用 create 的幂等键
 *  - 冻结走 BillingService reservationMode=false → LedgerService V2 CreditOperation 路径
 *
 * Mock 模式（TEMPORAL_MOCK_MODE=true）：
 *  - 跳过真实 Temporal 调用
 *  - 直接更新状态为 COMPLETED 模拟进度
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import Redis from 'ioredis'
import { DataSource, Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import { BusinessException, ErrorCode, generateIdempotencyKey } from '@reelclone/common'
import { DATABASE_CONNECTIONS, Benchmark, BenchmarkStatus, REDIS_CLIENT } from '@reelclone/database'
import { PromptEngineService, StructuredReport } from '@reelclone/ai'
import { BillingClient } from './billing-client'
import { TemporalAdapter } from './temporal-adapter'
import { CreateBenchmarkDto } from './dto/create-benchmark.dto'
import { ListBenchmarksDto } from './dto/list-benchmarks.dto'
import { detectPlatform } from './platform-detector.util'

/** 默认消耗积分 */
const DEFAULT_ESTIMATED_POINTS = 300

/** Redis 缓存 TTL（秒） */
const IDEMPOTENCY_TTL = 86400 // 24h
const FREEZE_ID_TTL = 604800 // 7d（Redis 回退缓存）

/** 工作流 ID 前缀 */
const WORKFLOW_ID_PREFIX = 'benchmark'

/** 幂等结果缓存 */
interface IdempotencyCache {
  benchmarkId: string
  status: BenchmarkStatus
  estimatedPoints: number
}

/** 分页查询结果 */
export interface PaginatedBenchmarks {
  list: Benchmark[]
  page: number
  pageSize: number
  total: number
}

/** 创建任务响应 */
export interface CreateBenchmarkResult {
  benchmarkId: string
  status: BenchmarkStatus
  estimatedPoints: number
}

/** 一键复刻建议响应 */
export interface CloneResult {
  benchmarkId: string
  prompt: string
  model: string
  resolution: string
  aspectRatio: string
  duration: number
}

/** Redis key 生成器 */
const idemKey = (key: string) => `benchmark:idem:${key}`
const freezeIdKey = (benchmarkId: string) => `benchmark:freeze:${benchmarkId}`

@Injectable()
export class BenchmarkService {
  private readonly logger = new Logger(BenchmarkService.name)
  private readonly mockMode: boolean
  private readonly estimatedPoints: number

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectDataSource(DATABASE_CONNECTIONS.BENCHMARK)
    private readonly benchmarkDataSource: DataSource,
    private readonly billingClient: BillingClient,
    private readonly temporalAdapter: TemporalAdapter,
    private readonly configService: ConfigService,
    private readonly promptEngine: PromptEngineService,
  ) {
    this.mockMode =
      this.configService.get<string>('TEMPORAL_MOCK_MODE') === 'true' ||
      process.env.TEMPORAL_MOCK_MODE === 'true'
    this.estimatedPoints =
      parseInt(
        this.configService.get<string>('BENCHMARK_ESTIMATED_POINTS') ||
          process.env.BENCHMARK_ESTIMATED_POINTS ||
          String(DEFAULT_ESTIMATED_POINTS),
        10,
      ) || DEFAULT_ESTIMATED_POINTS
  }

  // -------------------- 创建对标解析任务 --------------------

  /**
   * 提交对标解析任务
   *
   * 流程：
   *  1. 校验 URL（识别平台）
   *  2. 幂等检查（Redis）
   *  3. 创建 Benchmark 记录（状态=PENDING）
   *  4. 调用 billing-service 冻结积分（reservationMode=false → LedgerService V2）
   *  5. 持久化 freezeId 到 DB + Redis
   *  6. 启动 Temporal 工作流（Mock 模式跳过）
   *  7. 返回 benchmarkId
   */
  async create(userId: string, dto: CreateBenchmarkDto): Promise<CreateBenchmarkResult> {
    // 1. 校验 URL & 识别平台
    const platform = detectPlatform(dto.sourceUrl)
    if (!platform) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        '不支持的平台，仅支持抖音/小红书/B站/快手/微博/视频号',
        { code: 'UNSUPPORTED_PLATFORM', sourceUrl: dto.sourceUrl },
      )
    }

    // 2. 幂等检查
    const idempotencyKey =
      dto.idempotencyKey ||
      generateIdempotencyKey(userId, 'create_benchmark', {
        sourceUrl: dto.sourceUrl,
      })

    const cached = await this.redis.get(idemKey(idempotencyKey))
    if (cached) {
      const record: IdempotencyCache = JSON.parse(cached)
      this.logger.log(`幂等命中，返回已有 benchmark benchmarkId=${record.benchmarkId}`)
      return record
    }

    // 3. 创建 Benchmark 记录
    const repo = this.benchmarkDataSource.getRepository(Benchmark)
    const benchmark = repo.create({
      userId,
      sourceUrl: dto.sourceUrl,
      platform,
      status: BenchmarkStatus.PENDING,
      consumedPoints: this.estimatedPoints,
    })
    await repo.save(benchmark)

    // 4. 调用 billing-service 冻结积分
    // B3: 使用独立的 freezeIdempotencyKey（不与 create 共用），
    //     避免 compensateRelease 复用 FREEZE 幂等键导致 release 被短路。
    const freezeIdempotencyKey = `benchmark-freeze:${benchmark.id}:${randomUUID()}`
    try {
      const freezeResult = await this.billingClient.freeze({
        userId,
        amount: this.estimatedPoints,
        idempotencyKey: freezeIdempotencyKey,
        benchmarkId: benchmark.id,
        description: '对标解析',
      })

      // 5. 持久化 freezeId + freezeIdempotencyKey（DB 权威 + Redis 回退缓存）
      await repo.update(benchmark.id, {
        freezeId: freezeResult.transactionId,
        freezeIdempotencyKey,
      })
      await this.redis.set(
        freezeIdKey(benchmark.id),
        freezeResult.transactionId,
        'EX',
        FREEZE_ID_TTL,
      )
    } catch (err) {
      // 冻结失败：更新状态为 FAILED 并抛出
      await repo.update(benchmark.id, {
        status: BenchmarkStatus.FAILED,
        errorMessage: `积分冻结失败: ${err instanceof Error ? err.message : String(err)}`,
      })
      throw err
    }

    // 6. 启动 Temporal 工作流
    const workflowId = `${WORKFLOW_ID_PREFIX}-${benchmark.id}`
    if (this.mockMode) {
      // Mock 模式：跳过 Temporal，直接更新状态为 COMPLETED 并写入 mock 解析结果
      this.logger.log(
        `Mock 模式：跳过 Temporal 调用，直接更新状态为 COMPLETED benchmarkId=${benchmark.id}`,
      )
      const mockAnalysisResult = {
        style: '节奏紧凑，画面切换频繁',
        pacing: '快节奏，前 3 秒强钩子',
        shotList: [
          {
            sceneIndex: 1,
            duration: 3,
            visual: '产品特写镜头',
            voiceover: '一句话卖点',
            onScreenText: '突出痛点',
          },
          {
            sceneIndex: 2,
            duration: 5,
            visual: '使用场景演示',
            voiceover: '解决方案说明',
            onScreenText: '产品名 + 核心优势',
          },
        ],
        copywriting: {
          hook: '震惊！你还在用旧方案吗？',
          body: '这款新品采用创新技术，效率提升 3 倍',
          cta: '立即点击下方链接购买',
        },
        sellingPoints: ['效率提升 3 倍', '操作简单', '性价比高'],
        templateSuggestion: '痛点钩子 → 解决方案 → 产品演示 → 行动号召',
        summaryMs: 120,
        // 兼容字段：部分老测试读取 script / keywords
        script:
          '震惊！你还在用旧方案吗？这款新品采用创新技术，效率提升 3 倍。立即点击下方链接购买。',
        keywords: ['产品演示', '效率提升', '创新技术', '行动号召'],
      }
      await repo.update(benchmark.id, {
        status: BenchmarkStatus.COMPLETED,
        analysisResult: mockAnalysisResult,
        completedAt: new Date(),
      })
    } else {
      try {
        await this.temporalAdapter.startBenchmarkAnalysis({
          benchmarkId: benchmark.id,
          userId,
          sourceUrl: dto.sourceUrl,
          platform: platform.toLowerCase(),
        })
        this.logger.log(
          `Temporal 工作流已启动 workflowId=${workflowId} benchmarkId=${benchmark.id}`,
        )
      } catch (err) {
        // Temporal 启动失败：补偿释放积分 + 更新状态为 FAILED
        this.logger.error(
          `Temporal 工作流启动失败 benchmarkId=${benchmark.id}: ${err instanceof Error ? err.message : String(err)}`,
        )
        await this.compensateRelease(benchmark.id, userId)
        await repo.update(benchmark.id, {
          status: BenchmarkStatus.FAILED,
          errorMessage: `工作流启动失败: ${err instanceof Error ? err.message : String(err)}`,
        })
        throw new BusinessException(ErrorCode.TASK_FAILED, '对标解析任务启动失败，请稍后重试', {
          benchmarkId: benchmark.id,
        })
      }
    }

    // 7. 缓存幂等结果
    const result: CreateBenchmarkResult = {
      benchmarkId: benchmark.id,
      status: BenchmarkStatus.PENDING,
      estimatedPoints: this.estimatedPoints,
    }
    await this.redis.set(idemKey(idempotencyKey), JSON.stringify(result), 'EX', IDEMPOTENCY_TTL)

    return result
  }

  // -------------------- 查询对标解析历史 --------------------

  /**
   * 分页查询用户对标解析历史
   */
  async findAll(userId: string, dto: ListBenchmarksDto): Promise<PaginatedBenchmarks> {
    const repo: Repository<Benchmark> = this.benchmarkDataSource.getRepository(Benchmark)

    const qb = repo.createQueryBuilder('b').where('b.userId = :userId', { userId })

    if (dto.platform) {
      qb.andWhere('b.platform = :platform', { platform: dto.platform })
    }

    if (dto.status) {
      qb.andWhere('b.status = :status', { status: dto.status })
    }

    qb.orderBy('b.createdAt', 'DESC')

    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  // -------------------- 查询单条详情 --------------------

  /**
   * 查询单条对标解析详情（校验所有权）
   */
  async findOne(userId: string, id: string): Promise<Benchmark> {
    const repo = this.benchmarkDataSource.getRepository(Benchmark)
    const benchmark = await repo.findOne({ where: { id } })

    if (!benchmark) {
      throw BusinessException.notFound('对标解析', { id })
    }

    if (benchmark.userId !== userId) {
      throw BusinessException.forbidden('无权访问该对标解析', { id, userId })
    }

    return benchmark
  }

  // -------------------- 取消对标解析 --------------------

  /**
   * 取消对标解析任务
   *
   * 流程：
   *  1. 查询 benchmark（校验所有权）
   *  2. 校验状态是否可取消（PENDING / DOWNLOADING / ANALYZING）
   *  3. 调用 Temporal cancelWorkflow（Mock 模式跳过）
   *  4. 更新状态为 CANCELLED
   *  5. 调用 billing-service 释放积分（使用 DB 持久化的 freezeId + freezeIdempotencyKey）
   */
  async cancel(
    userId: string,
    id: string,
  ): Promise<{ benchmarkId: string; status: BenchmarkStatus }> {
    const benchmark = await this.findOne(userId, id)

    // 校验状态
    const cancellableStatuses: BenchmarkStatus[] = [
      BenchmarkStatus.PENDING,
      BenchmarkStatus.DOWNLOADING,
      BenchmarkStatus.ANALYZING,
    ]
    if (!cancellableStatuses.includes(benchmark.status)) {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        `当前状态 ${benchmark.status} 不可取消`,
        { id, status: benchmark.status },
      )
    }

    const workflowId = `${WORKFLOW_ID_PREFIX}-${benchmark.id}`

    // 3. 取消 Temporal 工作流
    if (!this.mockMode) {
      try {
        await this.temporalAdapter.cancelWorkflow(workflowId, '用户主动取消')
        this.logger.log(`Temporal 工作流已取消 workflowId=${workflowId}`)
      } catch (err) {
        // 工作流可能已结束，记录日志但不阻塞取消流程
        this.logger.warn(
          `Temporal 取消工作流失败（可能已结束）workflowId=${workflowId}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    // 4. 更新状态为 CANCELLED
    const repo = this.benchmarkDataSource.getRepository(Benchmark)
    await repo.update(benchmark.id, {
      status: BenchmarkStatus.CANCELLED,
      completedAt: new Date(),
    })

    // 5. 释放积分（使用 DB 持久化的 freezeIdempotencyKey，不再复用 create 幂等键）
    await this.compensateRelease(benchmark.id, userId)

    return {
      benchmarkId: benchmark.id,
      status: BenchmarkStatus.CANCELLED,
    }
  }

  // -------------------- 生成一键复刻建议 --------------------

  /**
   * 基于对标解析结果生成一键复刻建议参数
   *
   * 流程：
   *  1. 查询 benchmark（校验所有权，复用 findOne）
   *  2. 校验状态为 COMPLETED，否则抛出 BadRequestException('解析尚未完成')
   *  3. 读取 analysisResult（结构化解析报告）
   *  4. 调用 PromptEngineService.generateClonePrompt 生成复刻建议
   *  5. 返回 CloneResult（含 prompt / model / resolution / aspectRatio / duration）
   */
  async clone(userId: string, id: string): Promise<CloneResult> {
    const benchmark = await this.findOne(userId, id)

    if (benchmark.status !== BenchmarkStatus.COMPLETED) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '解析尚未完成', {
        id,
        status: benchmark.status,
      })
    }

    if (!benchmark.analysisResult) {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, '解析结果为空，无法生成复刻建议', {
        id,
      })
    }

    const report = benchmark.analysisResult as unknown as StructuredReport
    const suggestion = await this.promptEngine.generateClonePrompt(report)

    return {
      benchmarkId: benchmark.id,
      prompt: suggestion.prompt,
      model: suggestion.recommendedModel,
      resolution: this.inferResolution(suggestion.recommendedAspectRatio),
      aspectRatio: suggestion.recommendedAspectRatio,
      duration: suggestion.recommendedDuration,
    }
  }

  // -------------------- 私有方法 --------------------

  /**
   * 根据宽高比推断推荐分辨率
   *
   * 当前统一返回 720p（覆盖 9:16 / 16:9 / 1:1 等常见场景）。
   * 后续可基于 aspectRatio 升级到 1080p。
   */
  private inferResolution(_aspectRatio: string): string {
    return '720p'
  }

  /**
   * 补偿释放积分
   *
   * B3 重构：
   *  - freezeId 从 DB 读取（权威源），Redis 作为回退缓存
   *  - freezeIdempotencyKey 从 DB 读取（独立于 create 幂等键）
   *  - 释放使用独立幂等键，避免被 FREEZE 结果短路
   */
  private async compensateRelease(benchmarkId: string, userId: string): Promise<void> {
    try {
      const repo = this.benchmarkDataSource.getRepository(Benchmark)
      const benchmark = await repo.findOne({ where: { id: benchmarkId } })

      // B3: 优先从 DB 读取 freezeId，回退到 Redis（兼容旧数据）
      let freezeId = benchmark?.freezeId ?? null
      if (!freezeId) {
        freezeId = await this.redis.get(freezeIdKey(benchmarkId))
      }
      if (!freezeId) {
        this.logger.warn(`未找到 freezeId，跳过释放积分 benchmarkId=${benchmarkId}`)
        return
      }

      // B3: 使用 DB 持久化的独立 freezeIdempotencyKey
      let releaseIdempotencyKey = benchmark?.freezeIdempotencyKey ?? null
      if (!releaseIdempotencyKey) {
        // 兼容旧数据：生成独立的 release 幂等键（不再复用 create 幂等键）
        releaseIdempotencyKey = `benchmark-release:${benchmarkId}:${randomUUID()}`
      }

      await this.billingClient.release({
        userId,
        amount: this.estimatedPoints,
        idempotencyKey: releaseIdempotencyKey,
        freezeId,
        description: '对标解析取消/失败，释放冻结积分',
      })

      // 释放成功后清除缓存
      await this.redis.del(freezeIdKey(benchmarkId))
    } catch (err) {
      // 释放失败不阻塞主流程，记录日志供后续补偿
      this.logger.error(
        `释放积分失败 benchmarkId=${benchmarkId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
