import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * template 库 — 用户上传视频转模板字段迁移
 *
 * 扩展 templates_status_enum 枚举：ANALYZING / ANALYSIS_FAILED
 * 新增字段：source_asset_id / video_meta / analysis_report / workflow_id / failure_reason
 */
export class AddTemplateUploadFields1700000000007 implements MigrationInterface {
  name = 'AddTemplateUploadFields1700000000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 扩展枚举类型 ----------------
    await queryRunner.query(`ALTER TYPE templates_status_enum ADD VALUE IF NOT EXISTS 'ANALYZING'`)
    await queryRunner.query(
      `ALTER TYPE templates_status_enum ADD VALUE IF NOT EXISTS 'ANALYSIS_FAILED'`,
    )

    // ---------------- 新增字段 ----------------
    await queryRunner.query(
      `ALTER TABLE "templates"
        ADD COLUMN IF NOT EXISTS "source_asset_id" varchar(36),
        ADD COLUMN IF NOT EXISTS "video_meta" jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "analysis_report" jsonb DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS "workflow_id" varchar(64),
        ADD COLUMN IF NOT EXISTS "failure_reason" text`,
    )

    // ---------------- 索引 ----------------
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_templates_source_asset_id" ON "templates" ("source_asset_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_templates_source_asset_id"`)

    // 删除字段
    await queryRunner.query(
      `ALTER TABLE "templates"
        DROP COLUMN IF EXISTS "failure_reason",
        DROP COLUMN IF EXISTS "workflow_id",
        DROP COLUMN IF EXISTS "analysis_report",
        DROP COLUMN IF EXISTS "video_meta",
        DROP COLUMN IF EXISTS "source_asset_id"`,
    )

    // 枚举类型不能直接 REMOVE VALUE，需重建类型（移除 ANALYZING / ANALYSIS_FAILED）
    await queryRunner.query(`ALTER TABLE "templates" ALTER COLUMN "status" DROP DEFAULT`)
    await queryRunner.query(`DROP TYPE IF EXISTS "templates_status_enum"`)
    await queryRunner.query(
      `CREATE TYPE templates_status_enum AS ENUM ('ACTIVE', 'OFFLINE', 'PENDING_REVIEW', 'REJECTED')`,
    )
    await queryRunner.query(
      `ALTER TABLE "templates" ALTER COLUMN "status" TYPE templates_status_enum USING "status"::text::templates_status_enum`,
    )
    await queryRunner.query(`ALTER TABLE "templates" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`)
  }
}
