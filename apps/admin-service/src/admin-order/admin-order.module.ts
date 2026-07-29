/**
 * 管理后台订单模块
 *
 * 导入：
 *  - main 库: Order, Package 实体（通过 DATABASE_CONNECTIONS.MAIN 连接）
 *
 * 提供：
 *  - AdminOrderService: 全平台订单列表 + 退款（跨服务调用 billing / order-service）
 *
 * 控制器：
 *  - AdminOrderController: api/v1/admin/orders
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuditLogModule } from '@reelclone/common'
import { DATABASE_CONNECTIONS, Order, Package } from '@reelclone/database'
import { AdminOrderController } from './admin-order.controller'
import { AdminOrderService } from './admin-order.service'

@Module({
  imports: [TypeOrmModule.forFeature([Order, Package], DATABASE_CONNECTIONS.MAIN), AuditLogModule],
  controllers: [AdminOrderController],
  providers: [AdminOrderService],
  exports: [AdminOrderService],
})
export class AdminOrderModule {}
