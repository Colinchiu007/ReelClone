import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 增强 billing_projection_outbox：增加 lease/backoff/dead-letter 基础设施。
 *
 * - DEAD 终态：毒丸事件不再无限重试
 * - attempts/nextAttemptAt：指数退避，避免故障期间疯狂重试
 * - leaseOwner/leaseExpiresAt：分布式 claim 防多实例竞争
 * - lastError：便于人工排查
 */
export class EnhanceBillingOutboxLeaseBackoff1700000000014 implements MigrationInterface {
  name = 'EnhanceBillingOutboxLeaseBackoff1700000000014'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 扩展 delivery_status 枚举，增加 DEAD
    await queryRunner.query(
      `ALTER TYPE billing_projection_outbox_delivery_status_enum ADD VALUE IF NOT EXISTS 'DEAD'`,
    )

    // 2. 新增列
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD COLUMN "attempts" integer NOT NULL DEFAULT 0`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD COLUMN "next_attempt_at" timestamptz`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD COLUMN "last_error" text`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD COLUMN "lease_owner" uuid`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD COLUMN "lease_expires_at" timestamptz`,
    )

    // 3. 约束：attempts 非负
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        ADD CONSTRAINT "chk_billing_projection_outbox_attempts_non_negative"
        CHECK ("attempts" >= 0)`,
    )

    // 4. claim 查询索引：(delivery_status, next_attempt_at, lease_expires_at)
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_projection_outbox_claim"
        ON "billing_projection_outbox" ("delivery_status", "next_attempt_at", "lease_expires_at")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_billing_projection_outbox_claim"`)
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox"
        DROP CONSTRAINT IF EXISTS "chk_billing_projection_outbox_attempts_non_negative"`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox" DROP COLUMN IF EXISTS "lease_expires_at"`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox" DROP COLUMN IF EXISTS "lease_owner"`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox" DROP COLUMN IF EXISTS "last_error"`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox" DROP COLUMN IF EXISTS "next_attempt_at"`,
    )
    await queryRunner.query(
      `ALTER TABLE "billing_projection_outbox" DROP COLUMN IF EXISTS "attempts"`,
    )
    // 注意：PostgreSQL 不支持从枚举中移除值，需重建枚举类型
  }
}
