/**
 * AdminUserModule — 用户管理模块
 *
 * 注册 main 库的 User 实体仓储，提供 AdminUserController + AdminUserService。
 *
 * 注意：此模块需在 app.module.ts 中统一注册（Task 后续步骤完成）。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User, DATABASE_CONNECTIONS } from '@reelclone/database'
import { BillingClient } from '../billing.client'
import { AdminUserController } from './admin-user.controller'
import { AdminUserService } from './admin-user.service'

@Module({
  imports: [
    // 注册 main 库的 User 实体仓储
    TypeOrmModule.forFeature([User], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [AdminUserController],
  providers: [AdminUserService, BillingClient],
  exports: [AdminUserService],
})
export class AdminUserModule {}
