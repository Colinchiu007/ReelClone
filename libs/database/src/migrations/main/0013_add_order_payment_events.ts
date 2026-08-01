import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 在 main 库内建立订单支付事件表（durable inbox 模式）。
 *
 * order_payment_events 记录每次微信支付回调的原始事件，用于：
 *  1. transaction_id 唯一性约束 → 幂等保证（同一微信流水号不重复处理）
 *  2. 事件持久化 → 处理崩溃后可补偿（查询 RECEIVED 状态事件）
 *  3. 审计追踪 → 原始 raw body + 解密结果 + 处理状态全量记录
 *
 * 历史数据不回填，本迁移只创建新结构。
 */
export class AddOrderPaymentEvents1700000000017 implements MigrationInterface {
  name = 'AddOrderPaymentEvents1700000000017'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_payment_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid,
        "order_no" varchar(32) NOT NULL,
        "transaction_id" varchar(64),
        "event_type" varchar(64),
        "notification_id" varchar(64),
        "raw_body" text NOT NULL,
        "verified" boolean NOT NULL DEFAULT false,
        "status" varchar(20) NOT NULL DEFAULT 'RECEIVED',
        "processed_at" timestamptz,
        "decrypt_result" jsonb,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_payment_events" PRIMARY KEY ("id")
      )`,
    )
    // transaction_id 唯一索引（仅对非 NULL 值生效）→ 幂等保证
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_order_payment_events_transaction_id"
        ON "order_payment_events" ("transaction_id")
        WHERE "transaction_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_order_payment_events_order_no"
        ON "order_payment_events" ("order_no")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_order_payment_events_status"
        ON "order_payment_events" ("status")`,
    )
    await queryRunner.query(
      `ALTER TABLE "order_payment_events"
        ADD CONSTRAINT "fk_order_payment_events_order" FOREIGN KEY ("order_id")
        REFERENCES "orders" ("id") ON DELETE SET NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_payment_events"
        DROP CONSTRAINT IF EXISTS "fk_order_payment_events_order"`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_payment_events_status"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_payment_events_order_no"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_order_payment_events_transaction_id"`)
    await queryRunner.query('DROP TABLE IF EXISTS "order_payment_events"')
  }
}
