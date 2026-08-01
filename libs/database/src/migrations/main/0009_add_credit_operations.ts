import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 在 main 库内建立计费操作权威记录和操作 outbox。
 *
 * CreditOperation 承载所有积分变动的 durable operation，作为 V2 计费
 * 一致性的基础。CreditOperationOutbox 用于将操作事件投递到 billing 库。
 *
 * 历史数据不回填，本迁移只创建新结构。
 */
export class AddCreditOperations1700000000013 implements MigrationInterface {
  name = 'AddCreditOperations1700000000013'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "credit_operations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "amount" integer NOT NULL,
        "related_order_id" uuid,
        "related_template_id" uuid,
        "related_work_id" uuid,
        "request_fingerprint" varchar NOT NULL,
        "idempotency_key" varchar NOT NULL,
        "operation_id" varchar NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'PENDING',
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_credit_operations" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_operations_idempotency"
        ON "credit_operations" ("user_id", "type", "idempotency_key", "request_fingerprint")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_operations_operation_id"
        ON "credit_operations" ("operation_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_operations_user_id"
        ON "credit_operations" ("user_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_operations_related_order"
        ON "credit_operations" ("related_order_id") WHERE "related_order_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_operations_related_work"
        ON "credit_operations" ("related_work_id") WHERE "related_work_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_operations"
        ADD CONSTRAINT "fk_credit_operations_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE RESTRICT`,
    )

    await queryRunner.query(
      `CREATE TABLE "credit_operation_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "operation_id" varchar NOT NULL,
        "credit_operation_id" uuid NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz,
        "last_error" text,
        "lease_owner" uuid,
        "lease_expires_at" timestamptz,
        "event_payload" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_credit_operation_outbox" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_operation_outbox_dispatch"
        ON "credit_operation_outbox" ("status", "next_attempt_at")
        WHERE "status" = 'PENDING'`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_operation_outbox_operation_id"
        ON "credit_operation_outbox" ("operation_id")`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        ADD CONSTRAINT "fk_credit_operation_outbox_credit_operation" FOREIGN KEY ("credit_operation_id")
        REFERENCES "credit_operations" ("id") ON DELETE RESTRICT`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        DROP CONSTRAINT IF EXISTS "fk_credit_operation_outbox_credit_operation"`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_operation_outbox_operation_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_operation_outbox_dispatch"`)
    await queryRunner.query('DROP TABLE IF EXISTS "credit_operation_outbox"')
    await queryRunner.query(
      `ALTER TABLE "credit_operations"
        DROP CONSTRAINT IF EXISTS "fk_credit_operations_user"`,
    )
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_operations_related_work"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_operations_related_order"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_operations_user_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_credit_operations_operation_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_credit_operations_idempotency"`)
    await queryRunner.query('DROP TABLE IF EXISTS "credit_operations"')
  }
}
