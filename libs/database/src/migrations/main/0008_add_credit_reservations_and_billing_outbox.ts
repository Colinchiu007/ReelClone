import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 在 main 库内建立生成积分预留的权威状态和 billing 投影 outbox。
 *
 * 历史流水和历史生成任务没有可验证的 reservation 关联，本迁移只创建新结构，
 * 绝不从描述、金额或其他推测字段回填。
 */
export class AddCreditReservationsAndBillingOutbox1700000000011 implements MigrationInterface {
  name = 'AddCreditReservationsAndBillingOutbox1700000000011'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE credit_reservations_status_enum AS ENUM ('OPEN', 'SETTLED', 'RELEASED')`,
    )
    await queryRunner.query(
      `CREATE TYPE billing_projection_outbox_type_enum AS ENUM ('FREEZE', 'SETTLE', 'RELEASE')`,
    )
    await queryRunner.query(
      `CREATE TYPE billing_projection_outbox_delivery_status_enum AS ENUM ('PENDING', 'DELIVERED')`,
    )

    await queryRunner.query(
      `CREATE TABLE "credit_reservations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "work_id" uuid NOT NULL,
        "amount" integer NOT NULL,
        "status" credit_reservations_status_enum NOT NULL DEFAULT 'OPEN',
        "freeze_operation_key" varchar(128) NOT NULL,
        "terminal_operation_key" varchar(128),
        "terminal_transaction_id" uuid,
        "balance_after_freeze" integer NOT NULL,
        "balance_after_terminal" integer,
        "terminal_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_credit_reservations" PRIMARY KEY ("id"),
        CONSTRAINT "chk_credit_reservations_amount_positive" CHECK ("amount" > 0)
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_reservations_freeze_operation_key" ON "credit_reservations" ("freeze_operation_key")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_reservations_terminal_operation_key" ON "credit_reservations" ("terminal_operation_key")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_reservations_terminal_transaction_id" ON "credit_reservations" ("terminal_transaction_id") WHERE "terminal_transaction_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_credit_reservations_open_work" ON "credit_reservations" ("work_id") WHERE "status" = 'OPEN'`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_reservations_user_status" ON "credit_reservations" ("user_id", "status")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_credit_reservations_work_status" ON "credit_reservations" ("work_id", "status")`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_reservations"
        ADD CONSTRAINT "fk_credit_reservations_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE RESTRICT`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_reservations"
        ADD CONSTRAINT "fk_credit_reservations_work" FOREIGN KEY ("work_id")
        REFERENCES "works" ("id") ON DELETE RESTRICT`,
    )

    await queryRunner.query(
      `CREATE TABLE "billing_projection_outbox" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reservation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "work_id" uuid NOT NULL,
        "type" billing_projection_outbox_type_enum NOT NULL,
        "amount" integer NOT NULL,
        "balance_snapshot" integer NOT NULL,
        "idempotency_key" varchar(128) NOT NULL,
        "delivery_status" billing_projection_outbox_delivery_status_enum NOT NULL DEFAULT 'PENDING',
        "delivered_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_billing_projection_outbox" PRIMARY KEY ("id"),
        CONSTRAINT "chk_billing_projection_outbox_amount_positive" CHECK ("amount" > 0)
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_projection_outbox_idempotency_key" ON "billing_projection_outbox" ("idempotency_key")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_projection_outbox_freeze_reservation" ON "billing_projection_outbox" ("reservation_id") WHERE "type" = 'FREEZE'`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_billing_projection_outbox_terminal_reservation" ON "billing_projection_outbox" ("reservation_id") WHERE "type" IN ('SETTLE', 'RELEASE')`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_projection_outbox_delivery_created" ON "billing_projection_outbox" ("delivery_status", "created_at")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_projection_outbox_reservation_type" ON "billing_projection_outbox" ("reservation_id", "type")`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD CONSTRAINT "fk_billing_projection_outbox_reservation" FOREIGN KEY ("reservation_id")
        REFERENCES "credit_reservations" ("id") ON DELETE RESTRICT`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD CONSTRAINT "fk_billing_projection_outbox_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE RESTRICT`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD CONSTRAINT "fk_billing_projection_outbox_work" FOREIGN KEY ("work_id")
        REFERENCES "works" ("id") ON DELETE RESTRICT`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "billing_projection_outbox"')
    await queryRunner.query('DROP TABLE IF EXISTS "credit_reservations"')
    await queryRunner.query('DROP TYPE IF EXISTS billing_projection_outbox_delivery_status_enum')
    await queryRunner.query('DROP TYPE IF EXISTS billing_projection_outbox_type_enum')
    await queryRunner.query('DROP TYPE IF EXISTS credit_reservations_status_enum')
  }
}
