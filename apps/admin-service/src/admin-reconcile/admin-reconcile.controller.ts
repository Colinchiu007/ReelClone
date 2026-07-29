/**
 * AdminReconcileController — 对账监控控制器
 *
 * 路由前缀：api/v1/admin/reconcile（api/v1 为全局前缀）
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - GET  /results?date=YYYY-MM-DD  查看对账结果（从 Redis 缓存读取）
 *  - POST /                         手动触发对账（调用 billing-service）
 *
 * 鉴权：
 *  - 全局 JwtAuthGuard 校验 JWT
 *  - @Roles('ADMIN', 'SUPER_ADMIN') 限制仅管理员可访问
 *  - @UseGuards(RolesGuard) 配合 @Roles() 做 RBAC 角色校验
 *  - @CurrentUser('userId') 获取操作者 ID（用于操作日志）
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser, Roles, RolesGuard } from '@reelclone/common'
import { AdminReconcileService } from './admin-reconcile.service'

@Controller('admin/reconcile')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminReconcileController {
  constructor(private readonly adminReconcileService: AdminReconcileService) {}

  // -------------------- GET /admin/reconcile/results --------------------

  /**
   * 查看对账结果
   *
   * Query: date = YYYY-MM-DD（默认今天）
   * 从 Redis 读取 `reconcile:results:{date}` 缓存，无缓存时返回空数组。
   */
  @Get('results')
  async getResults(@Query('date') date?: string) {
    return this.adminReconcileService.getResults(date)
  }

  // -------------------- POST /admin/reconcile --------------------

  /**
   * 手动触发对账
   *
   * body: { scope: 'all' | 'userId:xxx' }
   * 通过 HTTP 调用 billing-service 对账 API，返回对账结果摘要。
   * 操作者 ID 由 @CurrentUser 注入，记入操作日志。
   */
  @Post()
  async trigger(@Body() body: { scope: string }, @CurrentUser('userId') operatorId: string) {
    return this.adminReconcileService.triggerReconcile(body, operatorId)
  }
}
