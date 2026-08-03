/**
 * @reelclone/platform-data — 数据库依赖层
 *
 * 包含需要 @reelclone/database 或 @reelclone/observability 的共享模块：
 * - AuditLogModule / AuditLogService
 * - ConfigStoreModule / ConfigStoreService
 * - RedisBridgeModule（REDIS_CLIENT → OBS_REDIS_CLIENT 桥接）
 *
 * 设计原则：
 * - 本包是唯一允许导入 @reelclone/database 的共享库
 * - 其他共享库（common/foundation）不得直接导入 database
 */
export { AuditLogService, AuditLogModule } from './audit/audit-log.module'
export type { AuditLogInput, PaginatedAuditLog } from './audit/audit-log.service'

export { ConfigStoreService } from './config/config-store.service'
export { ConfigStoreModule } from './config/config-store.module'

export { RedisBridgeModule } from './redis-bridge.module'
