/**
 * AuditLogModule — 审计日志模块
 *
 * 提供 AuditLogService 供所有 admin 模块注入使用。
 * 需要在模块 imports 中添加 AuditLogModule.forRoot()。
 *
 * 用法：
 *   @Module({
 *     imports: [AuditLogModule],
 *     providers: [AdminOrderService],
 *   })
 *   export class AdminOrderModule {}
 */
import { Module } from '@nestjs/common'
import { DatabaseModule, DATABASE_CONNECTIONS, AuditLog } from '@reelclone/database'
import { AuditLogService } from './audit-log.service'

export { AuditLogService }

@Module({
  imports: [DatabaseModule.forFeature([AuditLog], DATABASE_CONNECTIONS.MAIN)],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
