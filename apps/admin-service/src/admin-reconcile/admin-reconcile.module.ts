/**
 * AdminReconcileModule — 对账监控模块
 *
 * 职责：
 *  - 查看对账结果（从 Redis 读取 `reconcile:results:{date}` 缓存）
 *  - 手动触发对账（通过 HTTP 调用 billing-service 的对账 API）
 *
 * 无需注册数据库实体仓储（对账逻辑由 billing-service 实现，本模块仅做编排与缓存）。
 *
 * 注意：此模块需在 app.module.ts 中统一注册（后续步骤完成）。
 */
import { Module } from '@nestjs/common'
import { AdminReconcileController } from './admin-reconcile.controller'
import { AdminReconcileService } from './admin-reconcile.service'

@Module({
  controllers: [AdminReconcileController],
  providers: [AdminReconcileService],
  exports: [AdminReconcileService],
})
export class AdminReconcileModule {}
