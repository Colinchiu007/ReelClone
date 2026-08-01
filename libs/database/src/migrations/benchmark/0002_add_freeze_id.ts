import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * benchmark 库迁移：添加 freeze_id + freeze_idempotency_key
 *
 * B3: 将冻结操作 ID 持久化到 benchmark 库，替代 Redis-only 存储，
 * 并为 release 补偿提供独立的幂等键字段。
 */
export class AddBenchmarkFreezeId1722470400000 implements MigrationInterface {
  name = 'AddBenchmarkFreezeId1722470400000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "benchmarks" ADD COLUMN "freeze_id" uuid`)
    await queryRunner.query(
      `ALTER TABLE "benchmarks" ADD COLUMN "freeze_idempotency_key" varchar(255)`,
    )
    await queryRunner.query(
      `CREATE INDEX "idx_benchmarks_freeze_id" ON "benchmarks" ("freeze_id") WHERE "freeze_id" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_benchmarks_freeze_id"`)
    await queryRunner.query(
      `ALTER TABLE "benchmarks" DROP COLUMN IF EXISTS "freeze_idempotency_key"`,
    )
    await queryRunner.query(`ALTER TABLE "benchmarks" DROP COLUMN IF EXISTS "freeze_id"`)
  }
}
