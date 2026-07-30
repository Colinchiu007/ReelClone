/**
 * AdminOrderController — 管理后台订单控制器
 *
 * 路由前缀：api/v1/admin/orders（api/v1 为全局前缀）
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - GET  /              全平台订单列表（分页 + 多条件筛选）
 *  - POST /:id/refund    订单退款（敏感操作）
 *
 * 鉴权：
 *  - 全局 JwtAuthGuard 校验 JWT（默认所有路由需登录）
 *  - @Roles('ADMIN', 'SUPER_ADMIN') 限制仅管理员可访问
 *  - @CurrentUser('userId') 获取操作者 ID（用于退款审计日志）
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, Roles } from '@reelclone/common'
import { AdminOrderService } from './admin-order.service'
import { ListOrdersDto } from './dto/list-orders.dto'
import { RefundOrderDto } from './dto/refund-order.dto'

@ApiTags('admin-order')
@Controller('admin/orders')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminOrderController {
  constructor(private readonly adminOrderService: AdminOrderService) {}

  /**
   * GET /api/v1/admin/orders
   * 全平台订单列表（分页 + status / userId / startDate / endDate 筛选）
   *
   * 返回精简字段：id / userId / packageId / amount / status / paymentMethod / createdAt
   */
  @Get()
  @ApiOperation({ summary: '全平台订单列表（分页 + 多条件筛选）' })
  async list(@Query() dto: ListOrdersDto) {
    return this.adminOrderService.findAll(dto)
  }

  /**
   * POST /api/v1/admin/orders/:id/refund
   * 订单退款（敏感操作）
   *
   * 请求体: { reason: string }
   * 退款流程：订单状态改 REFUNDED → billing 扣回积分 → order-service 微信退款
   * 操作者 ID 由 @CurrentUser 注入，记入退款审计日志
   */
  @Post(':id/refund')
  @ApiOperation({ summary: '订单退款（敏感操作）' })
  async refund(
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminOrderService.refund(id, dto, operatorId)
  }
}
