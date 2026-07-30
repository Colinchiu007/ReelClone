/**
 * 通知 REST 控制器
 *
 * 路由前缀：notifications（与全局前缀 api/v1 拼接后为 /api/v1/notifications）
 *
 * 端点：
 *  - GET    /                  通知列表（分页 + 筛选）
 *  - GET    /unread-count      未读数量
 *  - POST   /:id/read          标记单条已读
 *  - POST   /read-all          全部标记已读
 *
 * 所有端点均需 JWT（全局 JwtAuthGuard），无需 @Public()
 */
import { Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@reelclone/common'
import { NotificationService } from './notification.service'
import { ListNotificationsDto } from './dto/list-notifications.dto'

@ApiTags('notification')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 通知列表（分页 + 筛选）
   * GET /api/v1/notifications?page=1&pageSize=20&type=SYSTEM&isRead=false
   */
  @Get()
  @ApiOperation({ summary: '获取通知列表（分页 + 筛选）' })
  list(@CurrentUser('userId') userId: string, @Query() query: ListNotificationsDto) {
    return this.notificationService.listNotifications(userId, query)
  }

  /**
   * 未读数量
   * GET /api/v1/notifications/unread-count
   * 响应：{ count: number }
   *
   * 注意：必须放在 :id 路由之前，否则 unread-count 会被当成 notificationId
   */
  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  async unreadCount(@CurrentUser('userId') userId: string): Promise<{ count: number }> {
    const count = await this.notificationService.getUnreadCount(userId)
    return { count }
  }

  /**
   * 全部标记已读
   * POST /api/v1/notifications/read-all
   * 响应：{ affected: number }
   *
   * 注意：必须放在 :id/read 路由之前，否则 read-all 会被当成 notificationId
   */
  @Post('read-all')
  @ApiOperation({ summary: '全部通知标记为已读' })
  async markAllAsRead(@CurrentUser('userId') userId: string): Promise<{ affected: number }> {
    const affected = await this.notificationService.markAllAsRead(userId)
    return { affected }
  }

  /**
   * 标记单条已读
   * POST /api/v1/notifications/:id/read
   */
  @Post(':id/read')
  @ApiOperation({ summary: '标记单条通知为已读' })
  markAsRead(@CurrentUser('userId') userId: string, @Param('id') notificationId: string) {
    return this.notificationService.markAsRead(userId, notificationId)
  }
}
