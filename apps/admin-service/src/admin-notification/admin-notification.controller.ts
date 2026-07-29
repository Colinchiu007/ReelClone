/**
 * AdminNotificationController — 通知推送控制器
 *
 * 路由前缀：api/v1/admin/notifications（api/v1 为全局前缀）
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - POST /broadcast  广播公告（range: 'all' | 'active'）
 *  - POST /send       定向推送（指定 userId）
 *
 * 鉴权：
 *  - 全局 JwtAuthGuard 校验 JWT
 *  - @Roles('ADMIN', 'SUPER_ADMIN') 限制仅管理员可访问
 *  - @UseGuards(RolesGuard) 配合 @Roles() 做 RBAC 角色校验
 *  - @CurrentUser('userId') 获取操作者 ID（用于操作日志）
 */
import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { CurrentUser, Roles, RolesGuard } from '@reelclone/common'
import { AdminNotificationService } from './admin-notification.service'
import { BroadcastDto } from './dto/broadcast.dto'
import { SendNotificationDto } from './dto/send-notification.dto'

@Controller('admin/notifications')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminNotificationController {
  constructor(private readonly adminNotificationService: AdminNotificationService) {}

  // -------------------- POST /admin/notifications/broadcast --------------------

  /**
   * 广播公告
   *
   * body: { title, content, range: 'all' | 'active' }
   * - 'all'    推送给所有用户
   * - 'active' 推送给最近 7 天活跃用户
   * 通过 HTTP 调用 notification-service 逐个推送。
   */
  @Post('broadcast')
  async broadcast(@Body() dto: BroadcastDto, @CurrentUser('userId') operatorId: string) {
    return this.adminNotificationService.broadcast(dto, operatorId)
  }

  // -------------------- POST /admin/notifications/send --------------------

  /**
   * 定向推送
   *
   * body: { userId, title, content }
   * 通过 HTTP 调用 notification-service 推送给指定用户。
   */
  @Post('send')
  async send(@Body() dto: SendNotificationDto, @CurrentUser('userId') operatorId: string) {
    return this.adminNotificationService.send(dto, operatorId)
  }
}
