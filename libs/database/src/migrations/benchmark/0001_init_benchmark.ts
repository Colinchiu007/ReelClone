import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * benchmark 库初始迁移
 * 创建对标解析表
 */
export class InitBenchmark1700000000003 implements MigrationInterface {
  name = 'InitBenchmark1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 启用 uuid 扩展 ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- 枚举类型 ----------------
    await queryRunner.query(
      `CREATE TYPE benchmarks_platform_enum AS ENUM ('DOUYIN', 'XIAOHONGSHU', 'BILIBILI', 'KUAISHOU', 'WEIBO', 'WECHAT_VIDEO')`,
    );
    await queryRunner.query(
      `CREATE TYPE benchmarks_status_enum AS ENUM ('PENDING', 'DOWNLOADING', 'ANALYZING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    );

    // ---------------- benchmarks ----------------
    await queryRunner.query(
      `CREATE TABLE "benchmarks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "source_url" varchar(1024) NOT NULL,
        "platform" benchmarks_platform_enum NOT NULL,
        "status" benchmarks_status_enum NOT NULL DEFAULT 'PENDING',
        "video_key" varchar(512),
        "consumed_points" int NOT NULL DEFAULT 0,
        "analysis_result" jsonb,
        "shots" jsonb,
        "transcript" jsonb,
        "ocr_result" jsonb,
        "visual_description" jsonb,
        "error_message" text,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_benchmarks" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_benchmarks_user_id_created_at" ON "benchmarks" ("user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "benchmarks"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "benchmarks_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "benchmarks_platform_enum"`);
  }
}
