/**
 * AdminStatsModule — 数据统计模块
 *
 * 注册 main 库（User / Work / Order）与 billing 库（PointTransaction）实体仓储。
 *
 * 提供：
 *  - AdminStatsService: 概览指标 + 积分流水查询
 *  - AdminStatsController: api/v1/admin/stats
 *
 * 注意：此模块需在 app.module.ts 中统一注册（后续步骤完成）。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DATABASE_CONNECTIONS, Order, PointTransaction, User, Work } from '@reelclone/database'
import { AdminStatsController } from './admin-stats.controller'
import { AdminStatsService } from './admin-stats.service'

@Module({
  imports: [
    // main 库：用户 / 作品 / 订单
    TypeOrmModule.forFeature([User, Work, Order], DATABASE_CONNECTIONS.MAIN),
    // billing 库：积分流水
    TypeOrmModule.forFeature([PointTransaction], DATABASE_CONNECTIONS.BILLING),
  ],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
  exports: [AdminStatsService],
})
export class AdminStatsModule {}
