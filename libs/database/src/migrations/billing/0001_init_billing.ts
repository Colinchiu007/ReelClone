import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * billing 库初始迁移
 * 创建积分流水表
 */
export class InitBilling1700000000001 implements MigrationInterface {
  name = 'InitBilling1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 启用 uuid 扩展 ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- 枚举类型 ----------------
    await queryRunner.query(
      `CREATE TYPE point_transactions_type_enum AS ENUM ('FREEZE', 'SETTLE', 'RELEASE', 'GRANT', 'CONSUME')`,
    );

    // ---------------- point_transactions ----------------
    await queryRunner.query(
      `CREATE TABLE "point_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" point_transactions_type_enum NOT NULL,
        "amount" integer NOT NULL,
        "balance" integer NOT NULL,
        "work_id" uuid,
        "order_id" uuid,
        "idempotency_key" varchar(128) NOT NULL,
        "description" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_point_transactions" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_point_transactions_idempotency_key" ON "point_transactions" ("idempotency_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_point_transactions_user_id_created_at" ON "point_transactions" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "point_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "point_transactions_type_enum"`);
  }
}
