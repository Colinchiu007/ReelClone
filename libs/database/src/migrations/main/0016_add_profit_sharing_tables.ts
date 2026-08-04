import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 新增分账相关表（main 库）：
 *  - profit_sharing_receivers  分账接收方配置
 *  - profit_sharing_records    分账记录（订单维度）
 *  - profit_sharing_items      分账明细（接收方维度）
 */
export class AddProfitSharingTables1722700000000 implements MigrationInterface {
  name = 'AddProfitSharingTables1722700000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 分账接收方
    await queryRunner.query(`
      CREATE TABLE "profit_sharing_receivers" (
        "id"                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name"                 VARCHAR(64) NOT NULL,
        "type"                 VARCHAR(16) NOT NULL,
        "ratio"                INTEGER     NOT NULL,
        "receiver_type"        VARCHAR(32) NOT NULL,
        "receiver_account_id"  VARCHAR(128) NOT NULL,
        "status"               VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        "remark"               VARCHAR(255),
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_receivers_status" ON "profit_sharing_receivers" ("status")`,
    )

    // 2. 分账记录
    await queryRunner.query(`
      CREATE TABLE "profit_sharing_records" (
        "id"                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
        "order_id"              UUID        NOT NULL,
        "order_no"              VARCHAR(32) NOT NULL,
        "total_amount"          INTEGER     NOT NULL,
        "shared_amount"         INTEGER     NOT NULL DEFAULT 0,
        "status"                VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        "profit_sharing_no"     VARCHAR(64),
        "retry_count"           INTEGER     NOT NULL DEFAULT 0,
        "max_retry_count"       INTEGER     NOT NULL DEFAULT 3,
        "failure_reason"        TEXT,
        "shared_at"             TIMESTAMPTZ,
        "callback_at"           TIMESTAMPTZ,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_profit_sharing_records_order_id" ON "profit_sharing_records" ("order_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_records_order_no" ON "profit_sharing_records" ("order_no")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_records_status" ON "profit_sharing_records" ("status")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_records_created_at" ON "profit_sharing_records" ("created_at")`,
    )

    // 3. 分账明细
    await queryRunner.query(`
      CREATE TABLE "profit_sharing_items" (
        "id"                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
        "record_id"             UUID         NOT NULL,
        "receiver_id"           UUID         NOT NULL,
        "receiver_name"         VARCHAR(64)  NOT NULL,
        "ratio"                 INTEGER      NOT NULL,
        "amount"                INTEGER      NOT NULL,
        "receiver_type"         VARCHAR(32)  NOT NULL,
        "receiver_account_id"   VARCHAR(128) NOT NULL,
        "status"                VARCHAR(32)  NOT NULL DEFAULT 'PENDING',
        "fail_reason"           TEXT,
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_items_record_id" ON "profit_sharing_items" ("record_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_profit_sharing_items_receiver_id" ON "profit_sharing_items" ("receiver_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "profit_sharing_items"`)
    await queryRunner.query(`DROP TABLE "profit_sharing_records"`)
    await queryRunner.query(`DROP TABLE "profit_sharing_receivers"`)
  }
}
