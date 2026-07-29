/**
 * AdminNotificationService — 通知推送服务
 *
 * 职责：
 *  1. broadcast：广播公告
 *     - range='all'    遍历所有用户 ID
 *     - range='active' 遍历最近 7 天活跃用户（lastLoginAt 命中）
 *     - 逐个调用 notification-service 推送接口（best-effort，失败计入 failed 不中断）
 *  2. send：定向推送（指定 userId）
 *
 * 跨服务调用：
 *  - POST {NOTIFICATION_SERVICE_URL}/api/v1/notifications/
 *  - Header: x-api-key: {INTERNAL_API_KEY}
 *  - body: { userId, title, content, type: 'SYSTEM' }
 *
 * 数据源：main 库 users 表（仅查询 ID 列表用于广播定位）
 */
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DATABASE_CONNECTIONS, User } from '@reelclone/database'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { BroadcastDto, BroadcastRange } from './dto/broadcast.dto'
import { SendNotificationDto } from './dto/send-notification.dto'

/** 广播结果摘要 */
export interface BroadcastResult {
  /** 目标用户总数 */
  total: number
  /** 推送成功数 */
  success: number
  /** 推送失败数 */
  failed: number
}

/** 定向推送结果 */
export interface SendResult {
  userId: string
  success: boolean
}

/** notification-service 统一响应体（ApiResponse 包裹） */
interface ApiResponse<T> {
  code: number
  message: string
  data: T
  traceId?: string
}

/** 广播时活跃用户判定窗口（最近 7 天） */
const ACTIVE_WINDOW_DAYS = 7

/** 广播并发批量大小（每批 50 个用户并发推送） */
const BROADCAST_CONCURRENCY = 50

@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name)
  private readonly notificationServiceUrl: string
  private readonly internalApiKey: string

  constructor(
    @InjectRepository(User, DATABASE_CONNECTIONS.MAIN)
    private readonly userRepo: Repository<User>,
  ) {
    this.notificationServiceUrl = (
      process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:3007'
    ).replace(/\/$/, '')
    this.internalApiKey = process.env.INTERNAL_API_KEY ?? ''
  }

  // -------------------- 广播公告 --------------------

  /**
   * 广播公告
   *
   * 流程：
   *  1. 根据 range 查询目标用户 ID 列表
   *     - 'all'    全部用户
   *     - 'active' lastLoginAt 在最近 7 天内
   *  2. 逐个调用 notification-service 推送（best-effort）
   *  3. 汇总成功 / 失败计数
   *
   * @param dto 广播参数（title / content / range）
   * @param operatorId 操作者 ID（用于日志）
   */
  async broadcast(dto: BroadcastDto, operatorId: string): Promise<BroadcastResult> {
    if (!this.internalApiKey) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'INTERNAL_API_KEY 未配置，无法调用 notification-service',
      )
    }

    const range: BroadcastRange = dto.range ?? 'all'
    const userIds = await this.listTargetUserIds(range)

    this.logger.log(
      `管理员 ${operatorId} 发起广播 range=${range} total=${userIds.length} title="${dto.title}"`,
    )

    let success = 0
    let failed = 0

    // 并发批处理推送（每批 BROADCAST_CONCURRENCY 个用户并发）
    // 替代原来的 for 循环逐个 await，10w 用户场景下性能提升 ~50 倍
    for (let i = 0; i < userIds.length; i += BROADCAST_CONCURRENCY) {
      const batch = userIds.slice(i, i + BROADCAST_CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((userId) => this.pushNotification(userId, dto.title, dto.content)),
      )
      for (const r of results) {
        if (r.status === 'fulfilled') {
          success++
        } else {
          failed++
        }
      }
      // 批次级失败日志（避免逐条日志淹没）
      const batchFailed = results.filter((r) => r.status === 'rejected').length
      if (batchFailed > 0) {
        this.logger.warn(
          `广播批次 ${i / BROADCAST_CONCURRENCY + 1} 推送失败 ${batchFailed}/${batch.length}`,
        )
      }
    }

    this.logger.log(
      `广播完成 operatorId=${operatorId} total=${userIds.length} success=${success} failed=${failed}`,
    )

    return { total: userIds.length, success, failed }
  }

  // -------------------- 定向推送 --------------------

  /**
   * 定向推送
   *
   * 通过 HTTP 调用 notification-service 推送给指定用户。
   *
   * @param dto 推送参数（userId / title / content）
   * @param operatorId 操作者 ID（用于日志）
   */
  async send(dto: SendNotificationDto, operatorId: string): Promise<SendResult> {
    if (!this.internalApiKey) {
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        'INTERNAL_API_KEY 未配置，无法调用 notification-service',
      )
    }

    this.logger.log(`管理员 ${operatorId} 定向推送 userId=${dto.userId} title="${dto.title}"`)

    try {
      await this.pushNotification(dto.userId, dto.title, dto.content)
      this.logger.log(`定向推送成功 userId=${dto.userId}`)
      return { userId: dto.userId, success: true }
    } catch (err) {
      this.logger.error(`定向推送失败 userId=${dto.userId} error=${(err as Error).message}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        `通知推送失败: ${(err as Error).message}`,
        { userId: dto.userId },
      )
    }
  }

  // -------------------- 内部工具 --------------------

  /** 查询目标用户 ID 列表 */
  private async listTargetUserIds(range: BroadcastRange): Promise<string[]> {
    if (range === 'active') {
      const since = new Date()
      since.setDate(since.getDate() - ACTIVE_WINDOW_DAYS)
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select(['u.id'])
        .where('u.lastLoginAt >= :since', { since })
        .getMany()
      return users.map((u) => u.id)
    }

    // range === 'all'
    const users = await this.userRepo.createQueryBuilder('u').select(['u.id']).getMany()
    return users.map((u) => u.id)
  }

  /**
   * 调用 notification-service 推送单条通知
   *
   * 端点: POST {NOTIFICATION_SERVICE_URL}/api/v1/notifications/
   * Header: x-api-key: {INTERNAL_API_KEY}
   * body: { userId, title, content, type: 'SYSTEM' }
   */
  private async pushNotification(userId: string, title: string, content: string): Promise<void> {
    const url = `${this.notificationServiceUrl}/api/v1/notifications/`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.internalApiKey,
      },
      body: JSON.stringify({
        userId,
        title,
        content,
        type: 'SYSTEM',
      }),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`notification-service 推送失败: HTTP ${resp.status} ${text}`)
    }

    // 解析 ApiResponse，业务错误码视为失败
    const payload = (await resp.json()) as ApiResponse<unknown>
    if (payload.code !== ErrorCode.SUCCESS) {
      throw new Error(
        `notification-service 业务错误: code=${payload.code} message=${payload.message}`,
      )
    }
  }
}
