import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * template 库 UGC 字段迁移
 *
 * 为 templates 表增加 UGC 上传相关字段：
 *  - user_id:      模板创建者 ID（null 表示运营录入）
 *  - source_work_id: 来源作品 ID（跨库 workbench，仅逻辑关联）
 *  - author_name:  作者展示名
 *  - review_note:  审核备注
 *  - reviewed_at:  审核时间
 *  - updated_at:   更新时间
 *
 * 同时扩展 templates_status_enum 枚举类型，增加 PENDING_REVIEW / REJECTED 值。
 */
export class AddUgcFields1700000000003 implements MigrationInterface {
  name = 'AddUgcFields1700000000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 扩展枚举类型 ----------------
    // ALTER TYPE ... ADD VALUE 不能在事务块中执行，需单独提交
    await queryRunner.query(
      `ALTER TYPE templates_status_enum ADD VALUE IF NOT EXISTS 'PENDING_REVIEW'`,
    )
    await queryRunner.query(`ALTER TYPE templates_status_enum ADD VALUE IF NOT EXISTS 'REJECTED'`)

    // ---------------- 新增字段 ----------------
    await queryRunner.query(
      `ALTER TABLE "templates"
        ADD COLUMN "user_id" uuid,
        ADD COLUMN "source_work_id" uuid,
        ADD COLUMN "author_name" varchar(64),
        ADD COLUMN "review_note" text,
        ADD COLUMN "reviewed_at" timestamptz,
        ADD COLUMN "updated_at" timestamptz DEFAULT now()`,
    )

    // ---------------- 索引 ----------------
    await queryRunner.query(`CREATE INDEX "idx_templates_user_id" ON "templates" ("user_id")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_templates_user_id"`)

    // 删除字段
    await queryRunner.query(
      `ALTER TABLE "templates"
        DROP COLUMN IF EXISTS "updated_at",
        DROP COLUMN IF EXISTS "reviewed_at",
        DROP COLUMN IF EXISTS "review_note",
        DROP COLUMN IF EXISTS "author_name",
        DROP COLUMN IF EXISTS "source_work_id",
        DROP COLUMN IF EXISTS "user_id"`,
    )

    // 枚举类型不能直接 REMOVE VALUE
    // 重建类型（移除 PENDING_REVIEW / REJECTED）：
    //   1. 删除 status 列的 DEFAULT
    //   2. 删除旧类型
    //   3. 创建新类型（仅 ACTIVE / OFFLINE）
    //   4. 将列类型改为新类型
    //   5. 恢复 DEFAULT
    await queryRunner.query(`ALTER TABLE "templates" ALTER COLUMN "status" DROP DEFAULT`)
    await queryRunner.query(`DROP TYPE IF EXISTS "templates_status_enum"`)
    await queryRunner.query(`CREATE TYPE templates_status_enum AS ENUM ('ACTIVE', 'OFFLINE')`)
    await queryRunner.query(
      `ALTER TABLE "templates" ALTER COLUMN "status" TYPE templates_status_enum USING "status"::text::templates_status_enum`,
    )
    await queryRunner.query(`ALTER TABLE "templates" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'`)
  }
}
