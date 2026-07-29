/**
 * Redis Pub/Sub 订阅器（EventSubscriber）
 *
 * 订阅来自 workbench-service / temporal-worker 等上游服务推送的事件频道：
 *  - notification:task-progress   → 任务进度（不写库，仅推 WebSocket）
 *  - notification:task-completed  → 任务完成（写库 + 推 WebSocket + 可选订阅消息）
 *  - notification:task-failed     → 任务失败（写库 + 推 WebSocket + 可选订阅消息）
 *  - notification:system          → 系统通知（写库 + 推 WebSocket）
 *
 * 实现：
 *  - 使用独立的 ioredis 订阅客户端（与 REDIS_CLIENT 区分，避免 publish 阻塞）
 *  - onModuleInit 订阅所有频道；onModuleDestroy 关闭连接
 *  - 收到消息后：
 *      1. JSON.parse 消息体
 *      2. 按频道类型决定是否落库（progress 仅推不落库）
 *      3. 调用 gateway.pushToUser 实时推送
 *
 * 消息格式约定：
 *  - task-progress:   { userId, workId, progress(0-100), message }
 *  - task-completed:  { userId, workId, message? }
 *  - task-failed:     { userId, workId, message, errorCode? }
 *  - system:          { userId, title, content, data? }
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { NotificationType } from '@reelclone/database'
import { NotificationService } from './notification.service'
import { NotificationGateway } from './ws.gateway'

/** 频道名常量（与上游服务约定） */
export const CHANNELS = {
  TASK_PROGRESS: 'notification:task-progress',
  TASK_COMPLETED: 'notification:task-completed',
  TASK_FAILED: 'notification:task-failed',
  SYSTEM: 'notification:system',
} as const

/** task-progress 消息体 */
interface TaskProgressMessage {
  userId: string
  workId: string
  progress: number
  message?: string
}

/** task-completed 消息体 */
interface TaskCompletedMessage {
  userId: string
  workId: string
  message?: string
}

/** task-failed 消息体 */
interface TaskFailedMessage {
  userId: string
  workId: string
  message: string
  errorCode?: string
}

/** system 消息体 */
interface SystemMessage {
  userId: string
  title: string
  content?: string
  data?: Record<string, unknown>
}

@Injectable()
export class EventSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventSubscriber.name)

  /** 独立的订阅客户端（不复用 REDIS_CLIENT，避免 publish 阻塞） */
  private subscriber: Redis | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly notificationService: NotificationService,
    private readonly gateway: NotificationGateway,
  ) {}

  // -------------------- 生命周期 --------------------

  async onModuleInit(): Promise<void> {
    // 复用同一 Redis 配置，但新建一个连接用于 subscribe（ioredis 限制：subscribe 客户端不能发其他命令）
    const host = this.config.get<string>('REDIS_HOST') || 'localhost'
    const port = parseInt(this.config.get<string>('REDIS_PORT') || '6379', 10)
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined
    const db = parseInt(this.config.get<string>('REDIS_DB') || '0', 10)

    this.subscriber = new Redis({
      host,
      port,
      password,
      db,
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    })

    const channels = Object.values(CHANNELS)
    await this.subscriber.subscribe(...channels)
    this.logger.log(`已订阅频道：${channels.join(', ')}`)

    this.subscriber.on('message', (channel, message) => {
      // 异步处理，不阻塞 ioredis 事件循环
      void this.handleMessage(channel, message).catch((err) => {
        this.logger.error(`处理消息失败 channel=${channel}: ${(err as Error).message}`)
      })
    })
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      try {
        this.subscriber.disconnect()
        this.logger.log('订阅客户端已断开')
      } catch (err) {
        this.logger.warn(`断开订阅客户端时出错: ${(err as Error).message}`)
      }
      this.subscriber = null
    }
  }

  // -------------------- 消息分发 --------------------

  private async handleMessage(channel: string, raw: string): Promise<void> {
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      this.logger.warn(
        `丢弃非法 JSON 消息 channel=${channel} err=${(err as Error).message} raw=${raw}`,
      )
      return
    }

    switch (channel) {
      case CHANNELS.TASK_PROGRESS:
        await this.onTaskProgress(payload as unknown as TaskProgressMessage)
        break
      case CHANNELS.TASK_COMPLETED:
        await this.onTaskCompleted(payload as unknown as TaskCompletedMessage)
        break
      case CHANNELS.TASK_FAILED:
        await this.onTaskFailed(payload as unknown as TaskFailedMessage)
        break
      case CHANNELS.SYSTEM:
        await this.onSystem(payload as unknown as SystemMessage)
        break
      default:
        this.logger.warn(`未识别的频道：${channel}`)
    }
  }

  // -------------------- 各频道处理 --------------------

  /**
   * 任务进度：仅推 WebSocket，不写库
   * 进度频繁更新，写库会产生大量噪声数据
   */
  private async onTaskProgress(msg: TaskProgressMessage): Promise<void> {
    if (!msg.userId || !msg.workId) {
      this.logger.warn(`task-progress 消息缺少 userId/workId: ${JSON.stringify(msg)}`)
      return
    }
    this.gateway.pushToUser(msg.userId, 'task:progress', {
      workId: msg.workId,
      progress: msg.progress,
      message: msg.message,
    })
  }

  /**
   * 任务完成：写库 + 推 WebSocket
   */
  private async onTaskCompleted(msg: TaskCompletedMessage): Promise<void> {
    if (!msg.userId || !msg.workId) {
      this.logger.warn(`task-completed 消息缺少 userId/workId: ${JSON.stringify(msg)}`)
      return
    }

    await this.notificationService.createAndPush(
      {
        userId: msg.userId,
        type: NotificationType.TASK_COMPLETED,
        title: '任务完成',
        content: msg.message ?? `作品 ${msg.workId} 已生成完成`,
        data: { workId: msg.workId },
      },
      'task:completed',
      { workId: msg.workId, message: msg.message },
    )
  }

  /**
   * 任务失败：写库 + 推 WebSocket
   */
  private async onTaskFailed(msg: TaskFailedMessage): Promise<void> {
    if (!msg.userId || !msg.workId) {
      this.logger.warn(`task-failed 消息缺少 userId/workId: ${JSON.stringify(msg)}`)
      return
    }

    await this.notificationService.createAndPush(
      {
        userId: msg.userId,
        type: NotificationType.TASK_FAILED,
        title: '任务失败',
        content: msg.message,
        data: { workId: msg.workId, errorCode: msg.errorCode },
      },
      'task:failed',
      { workId: msg.workId, message: msg.message },
    )
  }

  /**
   * 系统通知：写库 + 推 WebSocket
   */
  private async onSystem(msg: SystemMessage): Promise<void> {
    if (!msg.userId) {
      this.logger.warn(`system 消息缺少 userId: ${JSON.stringify(msg)}`)
      return
    }

    await this.notificationService.createAndPush(
      {
        userId: msg.userId,
        type: NotificationType.SYSTEM,
        title: msg.title,
        content: msg.content ?? null,
        data: msg.data ?? null,
      },
      'notification',
    )
  }
}
