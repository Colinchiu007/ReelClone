import 'reflect-metadata'

import { getMetadataArgsStorage } from 'typeorm'

import { User, UserStatus, UserRole } from '../user.entity'
import { Order, OrderStatus, PaymentMethod } from '../order.entity'
import { Work, WorkType, WorkStatus } from '../work.entity'
import {
  CreditOperation,
  CreditOperationType,
  CreditOperationStatus,
} from '../credit-operation.entity'
import { Asset, AssetType, AssetStatus } from '../asset.entity'
import { AuditLog } from '../audit-log.entity'
import { AvatarGroup, AuthorizationStatus, AvatarGroupStatus } from '../avatar-group.entity'
import { Benchmark, BenchmarkPlatform, BenchmarkStatus } from '../benchmark.entity'
import {
  BillingProjectionOutbox,
  BillingProjectionType,
  BillingProjectionDeliveryStatus,
} from '../billing-projection-outbox.entity'
import { CreditOperationOutbox, OutboxStatus } from '../credit-operation-outbox.entity'
import { CreditReservation, CreditReservationStatus } from '../credit-reservation.entity'
import { Favorite } from '../favorite.entity'
import { GenerationExecution, GenerationExecutionStage } from '../generation-execution.entity'
import { GenerationTask, GenerationProvider, GenerationTaskStatus } from '../generation-task.entity'
import { Notification, NotificationType } from '../notification.entity'
import { OrderPaymentEvent, PaymentEventStatus } from '../order-payment-event.entity'
import { Package, PackageType, PackageStatus } from '../package.entity'
import { PointTransaction, PointTransactionType } from '../point-transaction.entity'
import { ProfitSharingItem } from '../profit-sharing-item.entity'
import {
  ProfitSharingReceiver,
  ReceiverType,
  ReceiverStatus,
} from '../profit-sharing-receiver.entity'
import { ProfitSharingRecord, ProfitSharingStatus } from '../profit-sharing-record.entity'
import { SmsCode, SmsCodePurpose } from '../sms-code.entity'
import { SystemConfig } from '../system-config.entity'
import { Template, TemplateStatus } from '../template.entity'
import { UserPackage, UserPackageStatus } from '../user-package.entity'

/**
 * 实体装饰器元数据校验测试。
 *
 * 不连接数据库，仅通过 TypeORM 的 getMetadataArgsStorage() 读取装饰器写入的
 * 元数据，验证 @Entity / @PrimaryGeneratedColumn / @Column / @Index / 枚举 /
 * nullable 等结构性约束。重点防护「@Index 引用了未声明 @Column 的字段」这类
 * 曾导致 CI 失败的回归。
 */

const storage = getMetadataArgsStorage()

// ----------------------------- 元数据读取辅助 -----------------------------

function tableOf(target: object) {
  return storage.tables.find((t) => t.target === target)
}

function columnsOf(target: object) {
  return storage.columns.filter((c) => c.target === target)
}

function columnOf(target: object, prop: string) {
  return columnsOf(target).find((c) => c.propertyName === prop)
}

function columnOptions(target: object, prop: string): Record<string, unknown> {
  const col = columnOf(target, prop)
  if (!col) throw new Error(`column ${prop} not found on ${target.constructor.name}`)
  return col.options as Record<string, unknown>
}

function primaryColumnOf(target: object) {
  return columnsOf(target).find((c) => (c.options as { primary?: boolean }).primary === true)
}

function generationStrategyOf(target: object, prop: string) {
  return storage.generations.find((g) => g.target === target && g.propertyName === prop)?.strategy
}

function indicesOf(target: object) {
  return storage.indices.filter((i) => i.target === target)
}

// 某实体所有被 @Column / @PrimaryGeneratedColumn / @CreateDateColumn / @UpdateDateColumn
// 装饰的属性名集合
function columnPropNames(target: object): Set<string> {
  return new Set(columnsOf(target).map((c) => c.propertyName))
}

// ----------------------------- 列规格定义 -----------------------------
//
// type 字段为该列 @Column({type}) 的期望值；length/nullable/enum/precision/scale
// 仅在该列实际声明了对应选项时填写。primary 用于主键列。nullable=true 表示该列
// 在源码中标记了 nullable: true。

interface ColSpec {
  type: string
  length?: number
  nullable?: boolean
  primary?: boolean
  enum?: object
  precision?: number
  scale?: number
}

interface EnumSpec {
  obj: Record<string, string>
  expected: Record<string, string>
}

interface EntitySpec {
  name: string
  target: object
  table: string
  cols: Record<string, ColSpec>
  enums?: EnumSpec[]
}

const entities: EntitySpec[] = [
  // ----------------------------- User -----------------------------
  {
    name: 'User',
    target: User,
    table: 'users',
    cols: {
      id: { type: 'uuid', primary: true },
      openId: { type: 'varchar', length: 64 },
      unionId: { type: 'varchar', length: 64, nullable: true },
      mobile: { type: 'varchar', length: 16, nullable: true },
      password: { type: 'varchar', length: 128, nullable: true },
      nickname: { type: 'varchar', length: 64 },
      avatarUrl: { type: 'varchar', length: 512, nullable: true },
      email: { type: 'varchar', length: 128, nullable: true },
      currentPoints: { type: 'int' },
      totalPoints: { type: 'int' },
      industryPreferences: { type: 'jsonb' },
      status: { type: 'enum', enum: UserStatus },
      role: { type: 'enum', enum: UserRole },
      tokenVersion: { type: 'int' },
      lastLoginAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: UserStatus,
        expected: { ACTIVE: 'ACTIVE', FROZEN: 'FROZEN', DELETED: 'DELETED' },
      },
      {
        obj: UserRole,
        expected: { USER: 'USER', ADMIN: 'ADMIN', SUPER_ADMIN: 'SUPER_ADMIN' },
      },
    ],
  },

  // ----------------------------- Order -----------------------------
  {
    name: 'Order',
    target: Order,
    table: 'orders',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      packageId: { type: 'uuid' },
      orderNo: { type: 'varchar', length: 32 },
      amount: { type: 'decimal', precision: 10, scale: 2 },
      status: { type: 'enum', enum: OrderStatus },
      paymentMethod: { type: 'enum', enum: PaymentMethod, nullable: true },
      paidAt: { type: 'timestamptz', nullable: true },
      cancelledAt: { type: 'timestamptz', nullable: true },
      transactionId: { type: 'varchar', length: 64, nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: OrderStatus,
        expected: {
          PENDING: 'PENDING',
          PAID: 'PAID',
          CANCELLED: 'CANCELLED',
          REFUNDED: 'REFUNDED',
        },
      },
      { obj: PaymentMethod, expected: { WECHAT: 'WECHAT' } },
    ],
  },

  // ----------------------------- Work -----------------------------
  {
    name: 'Work',
    target: Work,
    table: 'works',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      type: { type: 'enum', enum: WorkType },
      title: { type: 'varchar', length: 255, nullable: true },
      prompt: { type: 'text', nullable: true },
      negativePrompt: { type: 'text', nullable: true },
      modelConfig: { type: 'jsonb' },
      idempotencyKey: { type: 'varchar', length: 128, nullable: true },
      resultKey: { type: 'varchar', length: 512, nullable: true },
      resultUrl: { type: 'varchar', length: 1024, nullable: true },
      thumbnailKey: { type: 'varchar', length: 512, nullable: true },
      status: { type: 'enum', enum: WorkStatus },
      cost: { type: 'int' },
      errorLog: { type: 'jsonb', nullable: true },
      benchmarkId: { type: 'uuid', nullable: true },
      templateId: { type: 'uuid', nullable: true },
      moderationResult: { type: 'jsonb', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: WorkType,
        expected: { TEXT: 'TEXT', IMAGE: 'IMAGE', VIDEO: 'VIDEO' },
      },
      {
        obj: WorkStatus,
        expected: {
          PENDING: 'PENDING',
          PROCESSING: 'PROCESSING',
          COMPLETED: 'COMPLETED',
          FAILED: 'FAILED',
          CANCELLED: 'CANCELLED',
          REJECTED: 'REJECTED',
          DELETED: 'DELETED',
        },
      },
    ],
  },

  // ----------------------------- CreditOperation -----------------------------
  // 注意：type/status 在 TS 侧是枚举，但列声明为 varchar（未走 TypeORM enum 列）。
  {
    name: 'CreditOperation',
    target: CreditOperation,
    table: 'credit_operations',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      type: { type: 'varchar', length: 20 },
      amount: { type: 'integer' },
      relatedOrderId: { type: 'uuid', nullable: true },
      relatedTemplateId: { type: 'uuid', nullable: true },
      relatedWorkId: { type: 'uuid', nullable: true },
      requestFingerprint: { type: 'varchar' },
      idempotencyKey: { type: 'varchar' },
      operationId: { type: 'varchar' },
      status: { type: 'varchar', length: 20 },
      metadata: { type: 'jsonb', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: CreditOperationType,
        expected: {
          GRANT: 'GRANT',
          REWARD: 'REWARD',
          CONSUME: 'CONSUME',
          FREEZE: 'FREEZE',
          RELEASE: 'RELEASE',
          SETTLE: 'SETTLE',
          ADMIN_GRANT: 'ADMIN_GRANT',
          ADMIN_ADJUST: 'ADMIN_ADJUST',
        },
      },
      {
        obj: CreditOperationStatus,
        expected: {
          PENDING: 'PENDING',
          CONFIRMED: 'CONFIRMED',
          FAILED: 'FAILED',
          DEAD: 'DEAD',
        },
      },
    ],
  },

  // ----------------------------- Asset -----------------------------
  {
    name: 'Asset',
    target: Asset,
    table: 'assets',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      type: { type: 'enum', enum: AssetType },
      name: { type: 'varchar', length: 255 },
      ossKey: { type: 'varchar', length: 512 },
      ossUrl: { type: 'varchar', length: 1024, nullable: true },
      mimeType: { type: 'varchar', length: 128, nullable: true },
      size: { type: 'bigint' },
      duration: { type: 'int', nullable: true },
      thumbnailKey: { type: 'varchar', length: 512, nullable: true },
      avatarGroupId: { type: 'uuid', nullable: true },
      status: { type: 'enum', enum: AssetStatus },
      reviewNote: { type: 'varchar', length: 512, nullable: true },
      reviewedAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: AssetType,
        expected: { IMAGE: 'IMAGE', VIDEO: 'VIDEO', AUDIO: 'AUDIO' },
      },
      {
        obj: AssetStatus,
        expected: {
          PENDING_REVIEW: 'PENDING_REVIEW',
          ACTIVE: 'ACTIVE',
          REJECTED: 'REJECTED',
          DELETED: 'DELETED',
        },
      },
    ],
  },

  // ----------------------------- AuditLog -----------------------------
  {
    name: 'AuditLog',
    target: AuditLog,
    table: 'audit_log',
    cols: {
      id: { type: 'uuid', primary: true },
      operatorId: { type: 'varchar', length: 64 },
      operatorRole: { type: 'varchar', length: 32 },
      action: { type: 'varchar', length: 64 },
      targetType: { type: 'varchar', length: 64 },
      targetId: { type: 'varchar', length: 64 },
      detail: { type: 'jsonb', nullable: true },
      result: { type: 'varchar', length: 16 },
      ip: { type: 'varchar', length: 64, nullable: true },
      userAgent: { type: 'varchar', length: 256, nullable: true },
      createdAt: { type: 'timestamptz' },
    },
  },

  // ----------------------------- AvatarGroup -----------------------------
  {
    name: 'AvatarGroup',
    target: AvatarGroup,
    table: 'avatar_groups',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      name: { type: 'varchar', length: 64 },
      description: { type: 'text', nullable: true },
      authorizationKey: { type: 'varchar', length: 512, nullable: true },
      authorizationStatus: { type: 'enum', enum: AuthorizationStatus },
      assetCount: { type: 'int' },
      status: { type: 'enum', enum: AvatarGroupStatus },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: AuthorizationStatus,
        expected: { PENDING: 'PENDING', APPROVED: 'APPROVED', EXPIRED: 'EXPIRED' },
      },
      {
        obj: AvatarGroupStatus,
        expected: { ACTIVE: 'ACTIVE', DELETED: 'DELETED' },
      },
    ],
  },

  // ----------------------------- Benchmark -----------------------------
  {
    name: 'Benchmark',
    target: Benchmark,
    table: 'benchmarks',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      sourceUrl: { type: 'varchar', length: 1024 },
      platform: { type: 'enum', enum: BenchmarkPlatform },
      status: { type: 'enum', enum: BenchmarkStatus },
      videoKey: { type: 'varchar', length: 512, nullable: true },
      consumedPoints: { type: 'int' },
      analysisResult: { type: 'jsonb', nullable: true },
      shots: { type: 'jsonb', nullable: true },
      transcript: { type: 'jsonb', nullable: true },
      ocrResult: { type: 'jsonb', nullable: true },
      visualDescription: { type: 'jsonb', nullable: true },
      errorMessage: { type: 'text', nullable: true },
      freezeId: { type: 'uuid', nullable: true },
      freezeIdempotencyKey: { type: 'varchar', length: 255, nullable: true },
      createdAt: { type: 'timestamptz' },
      completedAt: { type: 'timestamptz', nullable: true },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: BenchmarkPlatform,
        expected: {
          DOUYIN: 'DOUYIN',
          XIAOHONGSHU: 'XIAOHONGSHU',
          BILIBILI: 'BILIBILI',
          KUAISHOU: 'KUAISHOU',
          WEIBO: 'WEIBO',
          WECHAT_VIDEO: 'WECHAT_VIDEO',
        },
      },
      {
        obj: BenchmarkStatus,
        expected: {
          PENDING: 'PENDING',
          DOWNLOADING: 'DOWNLOADING',
          ANALYZING: 'ANALYZING',
          COMPLETED: 'COMPLETED',
          FAILED: 'FAILED',
          CANCELLED: 'CANCELLED',
        },
      },
    ],
  },

  // ----------------------------- BillingProjectionOutbox -----------------------------
  {
    name: 'BillingProjectionOutbox',
    target: BillingProjectionOutbox,
    table: 'billing_projection_outbox',
    cols: {
      id: { type: 'uuid', primary: true },
      reservationId: { type: 'uuid' },
      userId: { type: 'uuid' },
      workId: { type: 'uuid' },
      type: { type: 'enum', enum: BillingProjectionType },
      amount: { type: 'int' },
      balanceSnapshot: { type: 'int' },
      idempotencyKey: { type: 'varchar', length: 128 },
      deliveryStatus: { type: 'enum', enum: BillingProjectionDeliveryStatus },
      deliveredAt: { type: 'timestamptz', nullable: true },
      attempts: { type: 'int' },
      nextAttemptAt: { type: 'timestamptz', nullable: true },
      lastError: { type: 'text', nullable: true },
      leaseOwner: { type: 'uuid', nullable: true },
      leaseExpiresAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: BillingProjectionType,
        expected: { FREEZE: 'FREEZE', SETTLE: 'SETTLE', RELEASE: 'RELEASE' },
      },
      {
        obj: BillingProjectionDeliveryStatus,
        expected: { PENDING: 'PENDING', DELIVERED: 'DELIVERED', DEAD: 'DEAD' },
      },
    ],
  },

  // ----------------------------- CreditOperationOutbox -----------------------------
  // status 在 TS 侧是 OutboxStatus 枚举，但列声明为 varchar。
  {
    name: 'CreditOperationOutbox',
    target: CreditOperationOutbox,
    table: 'credit_operation_outbox',
    cols: {
      id: { type: 'uuid', primary: true },
      operationId: { type: 'varchar' },
      // 0019: 迁移改为 nullable（order-service 先写意图，grant 执行后才有权威操作可关联）
      creditOperationId: { type: 'uuid', nullable: true },
      status: { type: 'varchar', length: 30 },
      attempts: { type: 'int' },
      nextAttemptAt: { type: 'timestamptz', nullable: true },
      lastError: { type: 'text', nullable: true },
      leaseOwner: { type: 'uuid', nullable: true },
      leaseExpiresAt: { type: 'timestamptz', nullable: true },
      eventPayload: { type: 'jsonb' },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: OutboxStatus,
        expected: { PENDING: 'PENDING', DELIVERED: 'DELIVERED', DEAD: 'DEAD' },
      },
    ],
  },

  // ----------------------------- CreditReservation -----------------------------
  {
    name: 'CreditReservation',
    target: CreditReservation,
    table: 'credit_reservations',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      workId: { type: 'uuid' },
      amount: { type: 'int' },
      status: { type: 'enum', enum: CreditReservationStatus },
      freezeOperationKey: { type: 'varchar', length: 128 },
      terminalOperationKey: { type: 'varchar', length: 128, nullable: true },
      terminalTransactionId: { type: 'uuid', nullable: true },
      balanceAfterFreeze: { type: 'int' },
      balanceAfterTerminal: { type: 'int', nullable: true },
      terminalAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: CreditReservationStatus,
        expected: { OPEN: 'OPEN', SETTLED: 'SETTLED', RELEASED: 'RELEASED' },
      },
    ],
  },

  // ----------------------------- Favorite -----------------------------
  {
    name: 'Favorite',
    target: Favorite,
    table: 'favorites',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      templateId: { type: 'uuid' },
      createdAt: { type: 'timestamptz' },
    },
  },

  // ----------------------------- GenerationExecution -----------------------------
  // stage 在 TS 侧是 GenerationExecutionStage 枚举，但列声明为 varchar。
  {
    name: 'GenerationExecution',
    target: GenerationExecution,
    table: 'generation_executions',
    cols: {
      id: { type: 'uuid', primary: true },
      workId: { type: 'uuid' },
      taskId: { type: 'uuid', nullable: true },
      requestFingerprint: { type: 'varchar' },
      providerToken: { type: 'varchar', nullable: true },
      workflowId: { type: 'varchar' },
      billingOperationId: { type: 'uuid' },
      reservationId: { type: 'uuid' },
      stage: { type: 'varchar', length: 30 },
      attempt: { type: 'int' },
      recoveryDeadline: { type: 'timestamptz', nullable: true },
      reconcilerOwner: { type: 'uuid', nullable: true },
      lastReconciledAt: { type: 'timestamptz', nullable: true },
      metadata: { type: 'jsonb', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: GenerationExecutionStage,
        expected: {
          INITIATED: 'INITIATED',
          OUTPUT_READY: 'OUTPUT_READY',
          SETTLEMENT_PENDING: 'SETTLEMENT_PENDING',
          SETTLED: 'SETTLED',
          COMPLETION_PENDING: 'COMPLETION_PENDING',
          COMPLETED: 'COMPLETED',
          FAILED: 'FAILED',
          CANCELED: 'CANCELED',
          PROVIDER_STATE_UNKNOWN: 'PROVIDER_STATE_UNKNOWN',
          PROVIDER_CANCEL_PENDING: 'PROVIDER_CANCEL_PENDING',
          WORKFLOW_START_UNKNOWN: 'WORKFLOW_START_UNKNOWN',
          BILLING_RELEASE_PENDING: 'BILLING_RELEASE_PENDING',
        },
      },
    ],
  },

  // ----------------------------- GenerationTask -----------------------------
  {
    name: 'GenerationTask',
    target: GenerationTask,
    table: 'generation_tasks',
    cols: {
      id: { type: 'uuid', primary: true },
      workId: { type: 'uuid' },
      providerTaskId: { type: 'varchar', length: 128, nullable: true },
      provider: { type: 'enum', enum: GenerationProvider },
      status: { type: 'enum', enum: GenerationTaskStatus },
      attempts: { type: 'int' },
      startedAt: { type: 'timestamptz', nullable: true },
      completedAt: { type: 'timestamptz', nullable: true },
      error: { type: 'text', nullable: true },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: GenerationProvider,
        expected: { SEEDANCE: 'SEEDANCE', MOCK: 'MOCK' },
      },
      {
        obj: GenerationTaskStatus,
        expected: {
          PENDING: 'PENDING',
          RUNNING: 'RUNNING',
          COMPLETED: 'COMPLETED',
          FAILED: 'FAILED',
        },
      },
    ],
  },

  // ----------------------------- Notification -----------------------------
  {
    name: 'Notification',
    target: Notification,
    table: 'notifications',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      type: { type: 'enum', enum: NotificationType },
      title: { type: 'varchar', length: 128 },
      content: { type: 'text', nullable: true },
      data: { type: 'jsonb', nullable: true },
      isRead: { type: 'boolean' },
      readAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: NotificationType,
        expected: {
          TASK_COMPLETED: 'TASK_COMPLETED',
          TASK_FAILED: 'TASK_FAILED',
          PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
          SYSTEM: 'SYSTEM',
        },
      },
    ],
  },

  // ----------------------------- OrderPaymentEvent -----------------------------
  // status 在 TS 侧是 PaymentEventStatus 枚举，但列声明为 varchar。
  {
    name: 'OrderPaymentEvent',
    target: OrderPaymentEvent,
    table: 'order_payment_events',
    cols: {
      id: { type: 'uuid', primary: true },
      orderId: { type: 'uuid', nullable: true },
      orderNo: { type: 'varchar', length: 32 },
      transactionId: { type: 'varchar', length: 64, nullable: true },
      eventType: { type: 'varchar', length: 64, nullable: true },
      notificationId: { type: 'varchar', length: 64, nullable: true },
      rawBody: { type: 'text' },
      verified: { type: 'boolean' },
      status: { type: 'varchar', length: 20 },
      processedAt: { type: 'timestamptz', nullable: true },
      decryptResult: { type: 'jsonb', nullable: true },
      errorMessage: { type: 'text', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: PaymentEventStatus,
        expected: {
          RECEIVED: 'RECEIVED',
          PROCESSED: 'PROCESSED',
          FAILED: 'FAILED',
          DUPLICATED: 'DUPLICATED',
        },
      },
    ],
  },

  // ----------------------------- Package -----------------------------
  {
    name: 'Package',
    target: Package,
    table: 'packages',
    cols: {
      id: { type: 'uuid', primary: true },
      name: { type: 'varchar', length: 64 },
      description: { type: 'text', nullable: true },
      price: { type: 'decimal', precision: 10, scale: 2 },
      originalPrice: { type: 'decimal', precision: 10, scale: 2, nullable: true },
      points: { type: 'int' },
      bonusPoints: { type: 'int' },
      duration: { type: 'int' },
      features: { type: 'jsonb' },
      type: { type: 'enum', enum: PackageType },
      status: { type: 'enum', enum: PackageStatus },
      sort: { type: 'int' },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: PackageType,
        expected: { SUBSCRIPTION: 'SUBSCRIPTION', ONE_TIME: 'ONE_TIME' },
      },
      {
        obj: PackageStatus,
        expected: { ACTIVE: 'ACTIVE', OFFLINE: 'OFFLINE' },
      },
    ],
  },

  // ----------------------------- PointTransaction -----------------------------
  {
    name: 'PointTransaction',
    target: PointTransaction,
    table: 'point_transactions',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      type: { type: 'enum', enum: PointTransactionType },
      amount: { type: 'int' },
      balance: { type: 'int' },
      workId: { type: 'uuid', nullable: true },
      orderId: { type: 'uuid', nullable: true },
      templateId: { type: 'varchar', length: 36, nullable: true },
      freezeId: { type: 'uuid', nullable: true },
      reservationId: { type: 'uuid', nullable: true },
      idempotencyKey: { type: 'varchar', length: 128 },
      description: { type: 'varchar', length: 255 },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: PointTransactionType,
        expected: {
          FREEZE: 'FREEZE',
          SETTLE: 'SETTLE',
          RELEASE: 'RELEASE',
          GRANT: 'GRANT',
          CONSUME: 'CONSUME',
          REWARD: 'REWARD',
        },
      },
    ],
  },

  // ----------------------------- ProfitSharingItem -----------------------------
  // status 为普通字符串列（无对应枚举对象）。
  {
    name: 'ProfitSharingItem',
    target: ProfitSharingItem,
    table: 'profit_sharing_items',
    cols: {
      id: { type: 'uuid', primary: true },
      recordId: { type: 'uuid' },
      receiverId: { type: 'uuid' },
      receiverName: { type: 'varchar', length: 64 },
      ratio: { type: 'int' },
      amount: { type: 'int' },
      receiverType: { type: 'varchar', length: 32 },
      receiverAccountId: { type: 'varchar', length: 128 },
      status: { type: 'varchar', length: 32 },
      failReason: { type: 'text', nullable: true },
      createdAt: { type: 'timestamptz' },
    },
  },

  // ----------------------------- ProfitSharingReceiver -----------------------------
  {
    name: 'ProfitSharingReceiver',
    target: ProfitSharingReceiver,
    table: 'profit_sharing_receivers',
    cols: {
      id: { type: 'uuid', primary: true },
      name: { type: 'varchar', length: 64 },
      type: { type: 'enum', enum: ReceiverType },
      ratio: { type: 'int' },
      receiverType: { type: 'varchar', length: 32 },
      receiverAccountId: { type: 'varchar', length: 128 },
      status: { type: 'enum', enum: ReceiverStatus },
      remark: { type: 'varchar', length: 255, nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: ReceiverType,
        expected: { USER: 'USER', CHANNEL: 'CHANNEL' },
      },
      {
        obj: ReceiverStatus,
        expected: { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' },
      },
    ],
  },

  // ----------------------------- ProfitSharingRecord -----------------------------
  {
    name: 'ProfitSharingRecord',
    target: ProfitSharingRecord,
    table: 'profit_sharing_records',
    cols: {
      id: { type: 'uuid', primary: true },
      orderId: { type: 'uuid' },
      orderNo: { type: 'varchar', length: 32 },
      totalAmount: { type: 'int' },
      sharedAmount: { type: 'int' },
      status: { type: 'enum', enum: ProfitSharingStatus },
      profitSharingNo: { type: 'varchar', length: 64, nullable: true },
      retryCount: { type: 'int' },
      maxRetryCount: { type: 'int' },
      failureReason: { type: 'text', nullable: true },
      sharedAt: { type: 'timestamptz', nullable: true },
      callbackAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: ProfitSharingStatus,
        expected: {
          PENDING: 'PENDING',
          PROCESSING: 'PROCESSING',
          SUCCESS: 'SUCCESS',
          FAILED: 'FAILED',
          EXHAUSTED: 'EXHAUSTED',
        },
      },
    ],
  },

  // ----------------------------- SmsCode -----------------------------
  {
    name: 'SmsCode',
    target: SmsCode,
    table: 'sms_codes',
    cols: {
      id: { type: 'uuid', primary: true },
      mobile: { type: 'varchar', length: 16 },
      code: { type: 'varchar', length: 8 },
      purpose: { type: 'enum', enum: SmsCodePurpose },
      expiredAt: { type: 'timestamptz' },
      providerMessageId: { type: 'varchar', length: 128, nullable: true },
      usedAt: { type: 'timestamptz', nullable: true },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: SmsCodePurpose,
        expected: {
          BIND_MOBILE: 'BIND_MOBILE',
          RESET_PASSWORD: 'RESET_PASSWORD',
        },
      },
    ],
  },

  // ----------------------------- SystemConfig -----------------------------
  // 无 @Index 装饰器（configKey 的唯一约束通过列选项 unique: true 声明）。
  {
    name: 'SystemConfig',
    target: SystemConfig,
    table: 'system_config',
    cols: {
      id: { type: 'uuid', primary: true },
      configKey: { type: 'varchar', length: 128 },
      configValue: { type: 'text' },
      description: { type: 'varchar', length: 256, nullable: true },
      updatedAt: { type: 'timestamptz' },
    },
  },

  // ----------------------------- Template -----------------------------
  {
    name: 'Template',
    target: Template,
    table: 'templates',
    cols: {
      id: { type: 'uuid', primary: true },
      title: { type: 'varchar', length: 128 },
      description: { type: 'text', nullable: true },
      coverKey: { type: 'varchar', length: 512 },
      videoKey: { type: 'varchar', length: 512, nullable: true },
      prompt: { type: 'text', nullable: true },
      modelConfig: { type: 'jsonb' },
      category: { type: 'varchar', length: 64, nullable: true },
      industry: { type: 'varchar', length: 64, nullable: true },
      platform: { type: 'varchar', length: 32, nullable: true },
      tags: { type: 'jsonb' },
      useCount: { type: 'bigint' },
      favoriteCount: { type: 'bigint' },
      hotScore: { type: 'int' },
      status: { type: 'enum', enum: TemplateStatus },
      userId: { type: 'uuid', nullable: true },
      sourceWorkId: { type: 'uuid', nullable: true },
      authorName: { type: 'varchar', length: 64, nullable: true },
      reviewNote: { type: 'text', nullable: true },
      reviewedAt: { type: 'timestamptz', nullable: true },
      sourceAssetId: { type: 'varchar', length: 36, nullable: true },
      videoMeta: { type: 'jsonb' },
      analysisReport: { type: 'jsonb' },
      workflowId: { type: 'varchar', length: 64, nullable: true },
      failureReason: { type: 'text', nullable: true },
      createdAt: { type: 'timestamptz' },
      updatedAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: TemplateStatus,
        expected: {
          ACTIVE: 'ACTIVE',
          OFFLINE: 'OFFLINE',
          PENDING_REVIEW: 'PENDING_REVIEW',
          REJECTED: 'REJECTED',
          ANALYZING: 'ANALYZING',
          ANALYSIS_FAILED: 'ANALYSIS_FAILED',
        },
      },
    ],
  },

  // ----------------------------- UserPackage -----------------------------
  {
    name: 'UserPackage',
    target: UserPackage,
    table: 'user_packages',
    cols: {
      id: { type: 'uuid', primary: true },
      userId: { type: 'uuid' },
      packageId: { type: 'uuid' },
      orderId: { type: 'uuid', nullable: true },
      pointsTotal: { type: 'int' },
      pointsUsed: { type: 'int' },
      pointsRemaining: { type: 'int' },
      status: { type: 'enum', enum: UserPackageStatus },
      startedAt: { type: 'timestamptz' },
      expiredAt: { type: 'timestamptz' },
      createdAt: { type: 'timestamptz' },
    },
    enums: [
      {
        obj: UserPackageStatus,
        expected: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', REFUNDED: 'REFUNDED' },
      },
    ],
  },
]

// ----------------------------- 测试生成 -----------------------------

for (const spec of entities) {
  describe(`${spec.name} entity`, () => {
    // 1. @Entity 装饰器存在且表名正确
    it('has @Entity decorator with correct table name', () => {
      const table = tableOf(spec.target)
      expect(table).toBeDefined()
      expect(table?.name).toBe(spec.table)
      expect(table?.type).toBe('regular')
    })

    // 2. @PrimaryGeneratedColumn 存在
    it('has @PrimaryGeneratedColumn uuid on id', () => {
      const primary = primaryColumnOf(spec.target)
      expect(primary).toBeDefined()
      expect(primary?.propertyName).toBe('id')
      expect((primary?.options as { type?: unknown }).type).toBe('uuid')
      expect(generationStrategyOf(spec.target, 'id')).toBe('uuid')
    })

    // 完整性：声明的列与元数据中注册的列一一对应（防止遗漏或多余列）
    it('registered columns exactly match the spec', () => {
      const registered = columnsOf(spec.target)
        .map((c) => c.propertyName)
        .sort()
      const declared = Object.keys(spec.cols).sort()
      expect(registered).toEqual(declared)
    })

    // 3. 所有 @Column 装饰的字段有正确的类型（含 length/precision/scale/enum）
    it('all @Column fields have correct type', () => {
      for (const [prop, colSpec] of Object.entries(spec.cols)) {
        const opts = columnOptions(spec.target, prop)
        expect(opts.type).toBe(colSpec.type)
        if (colSpec.length !== undefined) {
          expect(opts.length).toBe(colSpec.length)
        }
        if (colSpec.precision !== undefined) {
          expect(opts.precision).toBe(colSpec.precision)
        }
        if (colSpec.scale !== undefined) {
          expect(opts.scale).toBe(colSpec.scale)
        }
        if (colSpec.primary) {
          expect(opts.primary).toBe(true)
        }
        if (colSpec.enum) {
          // 枚举列：类型必须是 enum，且 options.enum 指向期望的枚举对象
          expect(opts.type).toBe('enum')
          expect(opts.enum).toBe(colSpec.enum)
        }
      }
    })

    // 4. 所有 @Index 引用的列都有 @Column 装饰器（曾导致 CI 失败的回归防护）
    it('all @Index referenced columns have @Column decorator', () => {
      const names = columnPropNames(spec.target)
      const indices = indicesOf(spec.target)
      const referenced: string[] = []
      for (const idx of indices) {
        const cols = (idx.columns as unknown[] | undefined) ?? []
        for (const col of cols) {
          // TypeORM 中列引用为属性名字符串
          expect(typeof col).toBe('string')
          referenced.push(col as string)
          expect(names.has(col as string)).toBe(true)
        }
      }
      // 至少校验：若存在索引则必须引用到列；无索引的实体（如 SystemConfig）跳过
      if (indices.length === 0) {
        return
      }
      expect(referenced.length).toBeGreaterThan(0)
    })

    // 6. nullable 字段标记正确
    it('nullable fields are marked nullable', () => {
      for (const [prop, colSpec] of Object.entries(spec.cols)) {
        if (colSpec.nullable) {
          expect(columnOptions(spec.target, prop).nullable).toBe(true)
        } else {
          // 非主键列若未声明 nullable，则不应为 true
          if (!colSpec.primary) {
            expect(columnOptions(spec.target, prop).nullable).not.toBe(true)
          }
        }
      }
    })

    // 5. 枚举值正确
    const enumSpecs = spec.enums
    if (enumSpecs && enumSpecs.length > 0) {
      it('enum values are correct', () => {
        for (const e of enumSpecs) {
          expect(e.obj).toEqual(e.expected)
        }
      })
    }
  })
}

// 全局校验：确认为 25 个实体全部注册
describe('entity registry completeness', () => {
  it('covers all 25 entities', () => {
    expect(entities).toHaveLength(25)
    const tables = entities.map((e) => e.table).sort()
    // 25 个不重复的表名
    expect(new Set(tables).size).toBe(25)
  })
})
