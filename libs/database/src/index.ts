// ============================================================
// ReelClone 数据访问库 - 统一导出
// ============================================================

// ---------------- 实体 ----------------
export { User, UserStatus, UserRole } from './entities/user.entity'
export { Asset, AssetType, AssetStatus } from './entities/asset.entity'
export { AvatarGroup, AuthorizationStatus, AvatarGroupStatus } from './entities/avatar-group.entity'
export { Work, WorkType, WorkStatus } from './entities/work.entity'
export {
  GenerationTask,
  GenerationProvider,
  GenerationTaskStatus,
} from './entities/generation-task.entity'
export { Benchmark, BenchmarkPlatform, BenchmarkStatus } from './entities/benchmark.entity'
export { Template, TemplateStatus } from './entities/template.entity'
export { Favorite } from './entities/favorite.entity'
export { Package, PackageType, PackageStatus } from './entities/package.entity'
export { UserPackage, UserPackageStatus } from './entities/user-package.entity'
export { Order, OrderStatus, PaymentMethod } from './entities/order.entity'
export { PointTransaction, PointTransactionType } from './entities/point-transaction.entity'
export { SmsCode, SmsCodePurpose } from './entities/sms-code.entity'
export { Notification, NotificationType } from './entities/notification.entity'
export { SystemConfig } from './entities/system-config.entity'
export { AuditLog } from './entities/audit-log.entity'
export { CreditReservation, CreditReservationStatus } from './entities/credit-reservation.entity'
export {
  BillingProjectionOutbox,
  BillingProjectionType,
  BillingProjectionDeliveryStatus,
} from './entities/billing-projection-outbox.entity'
export {
  CreditOperation,
  CreditOperationType,
  CreditOperationStatus,
} from './entities/credit-operation.entity'
export { CreditOperationOutbox, OutboxStatus } from './entities/credit-operation-outbox.entity'
export {
  GenerationExecution,
  GenerationExecutionStage,
} from './entities/generation-execution.entity'
export { OrderPaymentEvent, PaymentEventStatus } from './entities/order-payment-event.entity'

// ---------------- 模块 ----------------
export {
  DatabaseModule,
  DATABASE_CONNECTIONS,
  buildDataSourceOptions,
  MAIN_ENTITIES,
  BILLING_ENTITIES,
  TEMPLATE_ENTITIES,
  BENCHMARK_ENTITIES,
} from './modules/database.module'
export { RedisModule, REDIS_CLIENT, RedisModuleOptions } from './modules/redis.module'
export { SnakeNamingStrategy } from './modules/snake-naming.strategy'

// ---------------- 迁移 ----------------
export {
  InitMain1700000000000,
  InitBilling1700000000001,
  InitTemplate1700000000002,
  AddUgcFields1700000000003,
  InitBenchmark1700000000003,
  AddUserRole1700000000004,
  AddSystemConfig1700000000005,
  AddCreditReservationsAndBillingOutbox1700000000011,
  AddReservationId1700000000012,
  AddCreditOperations1700000000013,
  AddGenerationExecutions1700000000014,
  AddUserPackageOrderIdUnique1700000000015,
  AddSmsCodeProviderMessageId1700000000016,
  AddOrderPaymentEvents1700000000017,
} from './migrations'
