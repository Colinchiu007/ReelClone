/**
 * 通知服务（NotificationService）
 *
 * 职责：
 *  1. 站内通知的 CRUD（list / markRead / markAllRead / unreadCount）
 *  2. 内部创建通知（供 EventSubscriber 在收到 Redis Pub/Sub 后调用）
 *  3. 通过 NotificationGateway 将通知实时推送到对应 user:{userId} 房间
 *
 * 数据访问：
 *  - 使用 main 库的 Notification 仓储（@InjectRepository(Notification, 'main')）
 *  - 已读时间 readAt 与 isRead 同步更新，便于后续做"已读时间分布"统计
 *
 * 所有权校验：
 *  - markAsRead 必须校验 notification.userId === currentUserId，否则抛 FORBIDDEN
 *  - markAllAsRead / list / unreadCount 都按 userId 强过滤，避免越权
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  BusinessException,
  ErrorCode,
  type PaginatedResponse,
} from '@reelclone/common'
import {
  DATABASE_CONNECTIONS,
  Notification,
  NotificationType,
} from '@reelclone/database'
import { ListNotificationsDto } from './dto/list-notifications.dto'
import { NotificationGateway } from './ws.gateway'

/** 创建通知的入参（EventSubscriber / Controller 内部调用） */
export interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  content?: string | null
  data?: Record<string, unknown> | null
}

/** WebSocket 推送事件名（与 Gateway 客户端约定一致） */
export type NotificationEvent =
  | 'task:progress'
  | 'task:completed'
  | 'task:failed'
  | 'notification'

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    @InjectRepository(Notification, DATABASE_CONNECTIONS.MAIN)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(NotificationGateway)
    private readonly gateway: NotificationGateway,
  ) {}

  // -------------------- 查询 --------------------

  /**
   * 通知列表（分页 + 筛选）
   * 按 createdAt 倒序，仅返回当前用户的通知
   */
  async listNotifications(
    userId: string,
    query: ListNotificationsDto,
  ): Promise<PaginatedResponse<Notification>> {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20

    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)

    if (query.type) {
      qb.andWhere('n.type = :type', { type: query.type })
    }
    if (query.isRead !== undefined) {
      qb.andWhere('n.is_read = :isRead', { isRead: query.isRead })
    }

    const [list, total] = await qb.getManyAndCount()

    return {
      code: ErrorCode.SUCCESS,
      message: 'success',
      data: {
        list,
        page,
        pageSize,
        total,
      },
    }
  }

  /**
   * 未读数量
   * 利用 (userId, isRead) 复合索引，O(log n) 计数
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, isRead: false },
    })
  }

  // -------------------- 写入 --------------------

  /**
   * 标记单条已读
   * 校验所有权：通知不属于当前用户 → FORBIDDEN
   * 通知不存在 → NOT_FOUND
   * 已经是已读状态 → 幂等返回，不重复更新 readAt
   */
  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
    })

    if (!notification) {
      throw BusinessException.notFound('通知')
    }

    if (notification.userId !== userId) {
      throw BusinessException.forbidden('无权操作此通知')
    }

    if (!notification.isRead) {
      notification.isRead = true
      notification.readAt = new Date()
      await this.notificationRepo.save(notification)
    }

    return notification
  }

  /**
   * 全部标记已读
   * 仅更新当前用户的未读通知，使用 UPDATE ... WHERE 一次性完成
   * 返回受影响行数
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    )
    return result.affected ?? 0
  }

  // -------------------- 内部创建 + 推送 --------------------

  /**
   * 创建一条通知（写库 + 推 WebSocket）
   *
   * @param input       通知内容
   * @param pushEvent   推送事件名（task:progress / task:completed / task:failed / notification）
   * @param pushPayload 推送给 WebSocket 客户端的 data（默认为通知本身）
   */
  async createAndPush(
    input: CreateNotificationInput,
    pushEvent: NotificationEvent = 'notification',
    pushPayload?: Record<string, unknown>,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      content: input.content ?? null,
      data: input.data ?? null,
      isRead: false,
      readAt: null,
    })
    const saved = await this.notificationRepo.save(notification)

    // 推送给当前用户的 WebSocket 房间
    try {
      this.gateway.pushToUser(input.userId, pushEvent, {
        notification: saved,
        ...(pushPayload ?? {}),
      })
    } catch (err) {
      // 推送失败不阻塞主流程，仅记录日志（用户离线时本就不会收到）
      this.logger.warn(
        `推送 WebSocket 失败 userId=${input.userId} event=${pushEvent}: ${(err as Error).message}`,
      )
    }

    return saved
  }
}
