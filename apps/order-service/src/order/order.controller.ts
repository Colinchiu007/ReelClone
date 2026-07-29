/**
 * 订单控制器
 *
 * 前缀: api/v1/orders（api/v1 为全局前缀）
 *
 * 端点（均需 JWT）:
 *  - POST   /             创建订单
 *  - GET    /             订单列表（分页）
 *  - GET    /:id          订单详情
 *  - POST   /:id/cancel   取消订单
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@reelclone/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * 创建订单
   * 请求体: { packageId, idempotencyKey? }
   * 响应: { orderId, orderNo, paymentParams }
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(userId, dto);
  }

  /**
   * 订单列表（分页 + 状态筛选）
   */
  @Get()
  async list(
    @CurrentUser('userId') userId: string,
    @Query() dto: ListOrdersDto,
  ) {
    return this.orderService.findAll(userId, dto);
  }

  /**
   * 订单详情（校验所有权）
   */
  @Get(':id')
  async detail(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.orderService.findOne(userId, id);
  }

  /**
   * 取消订单（仅 PENDING 状态可取消）
   */
  @Post(':id/cancel')
  async cancel(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.orderService.cancel(userId, id);
  }
}
