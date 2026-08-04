import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 新增资产审核字段（main 库）：
 *  - 扩展 assets.status 枚举：新增 PENDING_REVIEW / REJECTED
 *  - 新增 review_note / reviewed_at 字段
 *  - 存量数据迁移：已有的 ACTIVE 资产保持不变
 */
export class AddAssetReviewFields1722800000000 implements MigrationInterface {
  name = 'AddAssetReviewFields1722800000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL ENUM 追加新值（不能直接 ALTER，需 CREATE TYPE + ALTER COLUMN）
    await queryRunner.query(`
      ALTER TYPE "assets_status_enum" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW'
    `)
    await queryRunner.query(`
      ALTER TYPE "assets_status_enum" ADD VALUE IF NOT EXISTS 'REJECTED'
    `)

    // 新增审核字段
    await queryRunner.query(`
      ALTER TABLE "assets"
      ADD COLUMN "review_note" VARCHAR(512) NULL
    `)
    await queryRunner.query(`
      ALTER TABLE "assets"
      ADD COLUMN "reviewed_at" TIMESTAMPTZ NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "reviewed_at"`)
    await queryRunner.query(`ALTER TABLE "assets" DROP COLUMN "review_note"`)

    // NOTE: PostgreSQL 不支持 DROP VALUE from enum type
    // 如需完全回滚，需重建 enum 类型（MVP 阶段不做）
  }
}
