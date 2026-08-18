import 'reflect-metadata'
import { DataSource, DataSourceOptions } from 'typeorm'
import { SnakeNamingStrategy } from './modules/snake-naming.strategy'
import { InitMain1700000000000 } from './migrations/main/0001_init_main'
import { AddUserRole1700000000004 } from './migrations/main/0003_add_user_role'
import { AddSystemConfig1700000000005 } from './migrations/main/0004_add_system_config'
import { AddAuditLog1700000000006 } from './migrations/main/0005_add_audit_log'
import { AddWorksDeletedStatus1700000000007 } from './migrations/main/0006_add_works_deleted_status'
import { AddWorksIdempotencyKey1700000000009 } from './migrations/main/0007_add_works_idempotency_key'
import { AddCreditReservationsAndBillingOutbox1700000000011 } from './migrations/main/0008_add_credit_reservations_and_billing_outbox'
import { AddCreditOperations1700000000013 } from './migrations/main/0009_add_credit_operations'
import { AddGenerationExecutions1700000000014 } from './migrations/main/0010_add_generation_executions'
import { AddUserPackageOrderIdUnique1700000000015 } from './migrations/main/0011_add_user_package_order_id_unique'
import { AddSmsCodeProviderMessageId1700000000016 } from './migrations/main/0012_add_sms_code_provider_message_id'
import { AddOrderPaymentEvents1700000000017 } from './migrations/main/0013_add_order_payment_events'
import { EnhanceBillingOutboxLeaseBackoff1700000000014 } from './migrations/main/0014_enhance_billing_outbox_lease_backoff'
import { AddTokenVersionToUser1722600000000 } from './migrations/main/0015_add_token_version_to_user'
import { AddProfitSharingTables1722700000000 } from './migrations/main/0016_add_profit_sharing_tables'
import { AddAssetReviewFields1722800000000 } from './migrations/main/0017_add_asset_review_fields'
import { DropCreditReservationWorkFk1700000000018 } from './migrations/main/0018_drop_credit_reservation_work_fk'
import { MakeCreditOperationOutboxOpIdNullable1700000000019 } from './migrations/main/0019_make_credit_operation_outbox_op_id_nullable'
import { InitBilling1700000000001 } from './migrations/billing/0001_init_billing'
import { AddRewardType1700000000008 } from './migrations/billing/0002_add_reward_type'
import { AddFreezeReference1700000000010 } from './migrations/billing/0003_add_freeze_reference'
import { AddReservationId1700000000012 } from './migrations/billing/0004_add_reservation_id'
import { InitTemplate1700000000002 } from './migrations/template/0001_init_template'
import { AddUgcFields1700000000003 } from './migrations/template/0002_add_ugc_fields'
import { AddTemplateUploadFields1700000000007 } from './migrations/template/0003_add_template_upload_fields'
import { InitBenchmark1700000000003 } from './migrations/benchmark/0001_init_benchmark'
import { AddBenchmarkFreezeId1722470400000 } from './migrations/benchmark/0002_add_freeze_id'

/** 构造运行迁移用的数据源配置（不需要实体元数据） */
function buildOptions(
  database: string,
  migrations: DataSourceOptions['migrations'],
): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USER || 'reelclone',
    password: process.env.DATABASE_PASSWORD || 'reelclone_dev',
    database,
    synchronize: false,
    namingStrategy: new SnakeNamingStrategy(),
    migrations,
    migrationsRun: false,
    // template 库的 0002_add_ugc_fields 含 ALTER TYPE ... ADD VALUE，
    // 该语句不能在事务块中执行，因此该库迁移不使用事务
    migrationsTransactionMode: database === 'reelclone_template' ? 'none' : 'all',
    logging: ['error', 'warn'],
  }
}

/** 各数据库与其迁移清单的映射（按时间戳顺序） */
const dataSources: Array<{ name: string; ds: DataSource }> = [
  {
    name: 'main',
    ds: new DataSource(
      buildOptions('reelclone_main', [
        InitMain1700000000000,
        AddUserRole1700000000004,
        AddSystemConfig1700000000005,
        AddAuditLog1700000000006,
        AddWorksDeletedStatus1700000000007,
        AddWorksIdempotencyKey1700000000009,
        AddCreditReservationsAndBillingOutbox1700000000011,
        AddCreditOperations1700000000013,
        AddGenerationExecutions1700000000014,
        AddUserPackageOrderIdUnique1700000000015,
        AddSmsCodeProviderMessageId1700000000016,
        AddOrderPaymentEvents1700000000017,
        EnhanceBillingOutboxLeaseBackoff1700000000014,
        AddTokenVersionToUser1722600000000,
        AddProfitSharingTables1722700000000,
        AddAssetReviewFields1722800000000,
        DropCreditReservationWorkFk1700000000018,
        MakeCreditOperationOutboxOpIdNullable1700000000019,
      ]),
    ),
  },
  {
    name: 'billing',
    ds: new DataSource(
      buildOptions('reelclone_billing', [
        InitBilling1700000000001,
        AddRewardType1700000000008,
        AddFreezeReference1700000000010,
        AddReservationId1700000000012,
      ]),
    ),
  },
  {
    name: 'template',
    ds: new DataSource(
      buildOptions('reelclone_template', [
        InitTemplate1700000000002,
        AddUgcFields1700000000003,
        AddTemplateUploadFields1700000000007,
      ]),
    ),
  },
  {
    name: 'benchmark',
    ds: new DataSource(
      buildOptions('reelclone_benchmark', [
        InitBenchmark1700000000003,
        AddBenchmarkFreezeId1722470400000,
      ]),
    ),
  },
]

async function main(): Promise<void> {
  console.info('🚀 开始执行数据库迁移...')

  for (const { name, ds } of dataSources) {
    console.info(`\n📦 [${name}] 初始化数据源...`)
    await ds.initialize()
    const hasPending = await ds.showMigrations()
    if (hasPending) {
      console.info(`📦 [${name}] 执行待迁移...`)
      await ds.runMigrations()
      console.info(`✅ [${name}] 迁移完成`)
    } else {
      console.info(`⏭️  [${name}] 无待执行迁移`)
    }
    await ds.destroy()
  }

  console.info('\n🎉 全部数据库迁移完成')
}

main().catch((err: unknown) => {
  console.error('❌ 迁移执行失败:', err)
  process.exit(1)
})
