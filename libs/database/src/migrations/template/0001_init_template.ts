import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * template 库初始迁移
 * 创建模板表与收藏表
 */
export class InitTemplate1700000000002 implements MigrationInterface {
  name = 'InitTemplate1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 启用 uuid 扩展 ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- 枚举类型 ----------------
    await queryRunner.query(
      `CREATE TYPE templates_status_enum AS ENUM ('ACTIVE', 'OFFLINE')`,
    );

    // ---------------- templates ----------------
    await queryRunner.query(
      `CREATE TABLE "templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" varchar(128) NOT NULL,
        "description" text,
        "cover_key" varchar(512) NOT NULL,
        "video_key" varchar(512),
        "prompt" text,
        "model_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "category" varchar(64),
        "industry" varchar(64),
        "platform" varchar(32),
        "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "use_count" bigint NOT NULL DEFAULT 0,
        "favorite_count" bigint NOT NULL DEFAULT 0,
        "hot_score" integer NOT NULL DEFAULT 0,
        "status" templates_status_enum NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_templates" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_templates_category_industry" ON "templates" ("category", "industry")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_templates_hot_score" ON "templates" ("hot_score" DESC)`,
    );

    // ---------------- favorites ----------------
    await queryRunner.query(
      `CREATE TABLE "favorites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "template_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_favorites" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_favorites_user_id_template_id" ON "favorites" ("user_id", "template_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites"
        ADD CONSTRAINT "fk_favorites_template" FOREIGN KEY ("template_id")
        REFERENCES "templates" ("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "favorites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "templates"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "templates_status_enum"`);
  }
}
