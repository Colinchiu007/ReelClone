import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * billing 库 — 新增 REWARD 交易类型 + template_id 关联字段
 *
 * 扩展 point_transactions_type_enum 枚举：REWARD（模板被使用奖励上传者）
 * 新增字段：template_id（关联模板，REWARD 类型时填充）
 */
export class AddRewardType1700000000008 implements MigrationInterface {
  name = 'AddRewardType1700000000008'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 扩展枚举类型 ----------------
    await queryRunner.query(
      `ALTER TYPE point_transactions_type_enum ADD VALUE IF NOT EXISTS 'REWARD'`,
    )

    // ---------------- 新增字段 ----------------
    await queryRunner.query(
      `ALTER TABLE "point_transactions" ADD COLUMN IF NOT EXISTS "template_id" varchar(36)`,
    )

    // ---------------- 索引 ----------------
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_point_transactions_template_id" ON "point_transactions" ("template_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_point_transactions_template_id"`)

    // 删除字段
    await queryRunner.query(`ALTER TABLE "point_transactions" DROP COLUMN IF EXISTS "template_id"`)

    // 枚举类型不能直接 REMOVE VALUE，需重建类型（移除 REWARD）
    await queryRunner.query(`DROP TYPE IF EXISTS "point_transactions_type_enum"`)
    await queryRunner.query(
      `CREATE TYPE point_transactions_type_enum AS ENUM ('FREEZE', 'SETTLE', 'RELEASE', 'GRANT', 'CONSUME')`,
    )
    await queryRunner.query(
      `ALTER TABLE "point_transactions" ALTER COLUMN "type" TYPE point_transactions_type_enum USING "type"::text::point_transactions_type_enum`,
    )
  }
}
