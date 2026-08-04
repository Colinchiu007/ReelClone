/**
 * GenerationService 共享工具
 *
 * 从原 generation.service.ts 提取的幂等、账务、类型映射等公共逻辑，
 * 供 create/cancel/retry handler 共用。
 */
import { Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { DataSource } from 'typeorm'
import { BusinessException } from '@reelclone/common'
import { GenerationProvider, GenerationTask, Work, WorkStatus, WorkType } from '@reelclone/database'
import { type BillingReservation } from '@reelclone/temporal'
import { CapabilityRegistry, GenerationType } from '@reelclone/capability'
import { BillingClient } from '../billing.client'
import { TemplateClient } from '../template.client'
import { type CreateGenerationDto } from '../dto/create-generation.dto'

const logger = new Logger('GenerationShared')

// ============================================================
// 常量
// ============================================================

/** 幂等结果缓存 TTL（24h） */
export const IDEMPOTENCY_TTL = 86400

/** 幂等 Redis key 前缀 */
export const idemKey = (key: string) => `workbench:idem:${key}`

/** 生成请求锁 */
export const idemLockKey = (key: string) => `workbench:idem-lock:${key}`
export const IDEMPOTENCY_LOCK_TTL = 5 * 60

/** 重试锁 */
export const retryLockKey = (taskId: string) => `workbench:retry-lock:${taskId}`
export const RETRY_LOCK_TTL = 5 * 60

export const RELEASE_OWNED_LOCK_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

// ============================================================
// 类型
// ============================================================

/** 幂等缓存记录 */
export interface IdempotencyRecord {
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

// ============================================================
// 依赖容器（所有 handler 共享的外部依赖引用）
// ============================================================

export interface GenerationDeps {
  redis: Redis
  dataSource: DataSource
  billingClient: BillingClient
  templateClient: TemplateClient
}

// ============================================================
// 查询工具
// ============================================================

/**
 * 查询单个任务详情（校验所有权）
 */
export async function findOneTask(
  dataSource: DataSource,
  userId: string,
  taskId: string,
): Promise<TaskDetail> {
  const taskRepo = dataSource.getRepository(GenerationTask)
  const task = await taskRepo.findOne({
    where: { id: taskId },
    relations: ['work'],
  })
  if (!task) throw BusinessException.notFound('任务', { taskId })
  if (task.work.userId !== userId) throw BusinessException.forbidden('无权访问此任务', { taskId })
  return { task, work: task.work }
}

// ============================================================
// 账务工具
// ============================================================

export function createBillingReservation(
  amount: number,
  idempotencyKey: string,
  freezeId: string,
): BillingReservation {
  return {
    freezeId,
    amount,
    billingMode: 'v2',
    settleIdempotencyKey: billingOperationKey(idempotencyKey, 'settle'),
    releaseIdempotencyKey: billingOperationKey(idempotencyKey, 'release'),
  }
}

export function billingOperationKey(
  idempotencyKey: string,
  operation: 'freeze' | 'settle' | 'release',
): string {
  return `${idempotencyKey}:${operation}`
}

export function getBillingReservation(work: Work): BillingReservation {
  const cfg = (work.modelConfig ?? {}) as Record<string, unknown>
  const stored = cfg.billingReservation
  if (isBillingReservation(stored)) return stored

  const freezeId = typeof cfg.freezeId === 'string' ? cfg.freezeId : undefined
  const idempotencyKey = typeof cfg.idempotencyKey === 'string' ? cfg.idempotencyKey : undefined
  if (freezeId && idempotencyKey) {
    return createBillingReservation(work.cost, idempotencyKey, freezeId)
  }
  throw BusinessException.taskFailed('缺少可释放的积分预留')
}

export function isBillingReservation(value: unknown): value is BillingReservation {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<BillingReservation>
  return (
    typeof r.freezeId === 'string' &&
    typeof r.amount === 'number' &&
    typeof r.settleIdempotencyKey === 'string' &&
    typeof r.releaseIdempotencyKey === 'string'
  )
}

export async function releaseBillingReservation(
  deps: GenerationDeps,
  work: Work,
  reservation: BillingReservation,
  context: string,
): Promise<void> {
  try {
    await deps.billingClient.release(
      work.userId,
      reservation.amount,
      reservation.releaseIdempotencyKey,
      reservation.freezeId,
      reservation.billingMode ?? 'v2',
    )
  } catch (err) {
    const message = (err as Error).message
    logger.error(`释放积分失败 ${context}: ${message}`)
    await deps.dataSource.getRepository(Work).update(work.id, {
      status: WorkStatus.FAILED,
      errorLog: { step: 'billing_release_pending', message, context },
    })
    throw err
  }
}

// ============================================================
// 类型映射
// ============================================================

export function mapToWorkType(registry: CapabilityRegistry, type: GenerationType): WorkType {
  return registry.getWorkType(type) as WorkType
}

export function mapToProvider(
  registry: CapabilityRegistry,
  type: GenerationType,
): GenerationProvider {
  const provider = registry.getProvider(type)
  // GenerationProvider 枚举只定义了 SEEDANCE 和 MOCK
  if (provider === 'SEEDANCE') return GenerationProvider.SEEDANCE
  return GenerationProvider.MOCK
}

/** 从 Work.modelConfig 反向构建 DTO（用于重试） */
export function buildDtoFromWork(work: Work): CreateGenerationDto {
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

// ============================================================
// 幂等工具
// ============================================================

export async function getIdempotencyRecord(
  redis: Redis,
  key: string,
): Promise<CreateGenerationResult | null> {
  const cached = await redis.get(idemKey(key))
  if (cached) {
    try {
      return JSON.parse(cached) as CreateGenerationResult
    } catch {
      return null
    }
  }
  return null
}

export async function cacheIdempotencyRecord(
  redis: Redis,
  key: string,
  record: IdempotencyRecord,
): Promise<void> {
  await redis.set(idemKey(key), JSON.stringify(record), 'EX', IDEMPOTENCY_TTL)
}

export async function releaseOwnedLock(redis: Redis, key: string, token: string): Promise<void> {
  try {
    await redis.eval(RELEASE_OWNED_LOCK_SCRIPT, 1, key, token)
  } catch (err) {
    logger.warn(`释放 Redis 锁失败 key=${key}: ${(err as Error).message}`)
  }
}
