import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * main 库初始迁移
 * 创建用户/资产/形象组/作品/任务/套餐/订单/用户套餐/短信/通知表
 */
export class InitMain1700000000000 implements MigrationInterface {
  name = 'InitMain1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 启用 uuid 扩展 ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- 枚举类型 ----------------
    await queryRunner.query(
      `CREATE TYPE users_status_enum AS ENUM ('ACTIVE', 'FROZEN', 'DELETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE assets_type_enum AS ENUM ('IMAGE', 'VIDEO', 'AUDIO')`,
    );
    await queryRunner.query(
      `CREATE TYPE assets_status_enum AS ENUM ('ACTIVE', 'DELETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE avatar_groups_authorization_status_enum AS ENUM ('PENDING', 'APPROVED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE avatar_groups_status_enum AS ENUM ('ACTIVE', 'DELETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE works_type_enum AS ENUM ('TEXT', 'IMAGE', 'VIDEO')`,
    );
    await queryRunner.query(
      `CREATE TYPE works_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE generation_tasks_provider_enum AS ENUM ('SEEDANCE', 'MOCK')`,
    );
    await queryRunner.query(
      `CREATE TYPE generation_tasks_status_enum AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE packages_type_enum AS ENUM ('SUBSCRIPTION', 'ONE_TIME')`,
    );
    await queryRunner.query(
      `CREATE TYPE packages_status_enum AS ENUM ('ACTIVE', 'OFFLINE')`,
    );
    await queryRunner.query(
      `CREATE TYPE orders_status_enum AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE orders_payment_method_enum AS ENUM ('WECHAT')`,
    );
    await queryRunner.query(
      `CREATE TYPE user_packages_status_enum AS ENUM ('ACTIVE', 'EXPIRED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE sms_codes_purpose_enum AS ENUM ('BIND_MOBILE', 'RESET_PASSWORD')`,
    );
    await queryRunner.query(
      `CREATE TYPE notifications_type_enum AS ENUM ('TASK_COMPLETED', 'TASK_FAILED', 'PAYMENT_SUCCESS', 'SYSTEM')`,
    );

    // ---------------- users ----------------
    await queryRunner.query(
      `CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "open_id" varchar(64) NOT NULL,
        "union_id" varchar(64),
        "mobile" varchar(16),
        "password" varchar(128),
        "nickname" varchar(64) NOT NULL,
        "avatar_url" varchar(512),
        "email" varchar(128),
        "current_points" integer NOT NULL DEFAULT 0,
        "total_points" integer NOT NULL DEFAULT 0,
        "industry_preferences" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" users_status_enum NOT NULL DEFAULT 'ACTIVE',
        "last_login_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_open_id" ON "users" ("open_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_mobile" ON "users" ("mobile") WHERE "mobile" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_created_at" ON "users" ("created_at")`,
    );

    // ---------------- avatar_groups ----------------
    await queryRunner.query(
      `CREATE TABLE "avatar_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" varchar(64) NOT NULL,
        "description" text,
        "authorization_key" varchar(512),
        "authorization_status" avatar_groups_authorization_status_enum NOT NULL DEFAULT 'PENDING',
        "asset_count" integer NOT NULL DEFAULT 0,
        "status" avatar_groups_status_enum NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_avatar_groups" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_avatar_groups_user_id" ON "avatar_groups" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "avatar_groups"
        ADD CONSTRAINT "fk_avatar_groups_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE`,
    );

    // ---------------- assets ----------------
    await queryRunner.query(
      `CREATE TABLE "assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" assets_type_enum NOT NULL,
        "name" varchar(255) NOT NULL,
        "oss_key" varchar(512) NOT NULL,
        "oss_url" varchar(1024),
        "mime_type" varchar(128),
        "size" bigint NOT NULL DEFAULT 0,
        "duration" integer,
        "thumbnail_key" varchar(512),
        "avatar_group_id" uuid,
        "status" assets_status_enum NOT NULL DEFAULT 'ACTIVE',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_assets" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assets_user_id_type" ON "assets" ("user_id", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_assets_avatar_group_id" ON "assets" ("avatar_group_id") WHERE "avatar_group_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets"
        ADD CONSTRAINT "fk_assets_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "assets"
        ADD CONSTRAINT "fk_assets_avatar_group" FOREIGN KEY ("avatar_group_id")
        REFERENCES "avatar_groups" ("id") ON DELETE SET NULL`,
    );

    // ---------------- works ----------------
    await queryRunner.query(
      `CREATE TABLE "works" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" works_type_enum NOT NULL,
        "title" varchar(255),
        "prompt" text,
        "negative_prompt" text,
        "model_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "result_key" varchar(512),
        "result_url" varchar(1024),
        "thumbnail_key" varchar(512),
        "status" works_status_enum NOT NULL DEFAULT 'PENDING',
        "cost" integer NOT NULL DEFAULT 0,
        "error_log" jsonb,
        "benchmark_id" uuid,
        "template_id" uuid,
        "moderation_result" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_works" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_works_user_id_status" ON "works" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_works_user_id_type" ON "works" ("user_id", "type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_works_benchmark_id" ON "works" ("benchmark_id") WHERE "benchmark_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_works_template_id" ON "works" ("template_id") WHERE "template_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_works_created_at" ON "works" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "works"
        ADD CONSTRAINT "fk_works_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE`,
    );

    // ---------------- generation_tasks ----------------
    await queryRunner.query(
      `CREATE TABLE "generation_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "work_id" uuid NOT NULL,
        "provider_task_id" varchar(128),
        "provider" generation_tasks_provider_enum NOT NULL,
        "status" generation_tasks_status_enum NOT NULL DEFAULT 'PENDING',
        "attempts" integer NOT NULL DEFAULT 0,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_generation_tasks" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_tasks_work_id" ON "generation_tasks" ("work_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_tasks_status_provider" ON "generation_tasks" ("status", "provider")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_generation_tasks_provider_task_id" ON "generation_tasks" ("provider_task_id") WHERE "provider_task_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "generation_tasks"
        ADD CONSTRAINT "fk_generation_tasks_work" FOREIGN KEY ("work_id")
        REFERENCES "works" ("id") ON DELETE CASCADE`,
    );

    // ---------------- packages ----------------
    await queryRunner.query(
      `CREATE TABLE "packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(64) NOT NULL,
        "description" text,
        "price" numeric(10,2) NOT NULL,
        "original_price" numeric(10,2),
        "points" integer NOT NULL DEFAULT 0,
        "bonus_points" integer NOT NULL DEFAULT 0,
        "duration" integer NOT NULL DEFAULT 0,
        "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "type" packages_type_enum NOT NULL,
        "status" packages_status_enum NOT NULL DEFAULT 'ACTIVE',
        "sort" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_packages" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_packages_sort" ON "packages" ("sort")`,
    );

    // ---------------- orders ----------------
    await queryRunner.query(
      `CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "package_id" uuid NOT NULL,
        "order_no" varchar(32) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "status" orders_status_enum NOT NULL DEFAULT 'PENDING',
        "payment_method" orders_payment_method_enum,
        "paid_at" timestamptz,
        "cancelled_at" timestamptz,
        "transaction_id" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_orders" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_orders_order_no" ON "orders" ("order_no")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_user_id_status" ON "orders" ("user_id", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"
        ADD CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders"
        ADD CONSTRAINT "fk_orders_package" FOREIGN KEY ("package_id")
        REFERENCES "packages" ("id") ON DELETE RESTRICT`,
    );

    // ---------------- user_packages ----------------
    await queryRunner.query(
      `CREATE TABLE "user_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "package_id" uuid NOT NULL,
        "order_id" uuid,
        "points_total" integer NOT NULL DEFAULT 0,
        "points_used" integer NOT NULL DEFAULT 0,
        "points_remaining" integer NOT NULL DEFAULT 0,
        "status" user_packages_status_enum NOT NULL DEFAULT 'ACTIVE',
        "started_at" timestamptz NOT NULL,
        "expired_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_packages" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_user_packages_user_id_status" ON "user_packages" ("user_id", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_packages"
        ADD CONSTRAINT "fk_user_packages_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_packages"
        ADD CONSTRAINT "fk_user_packages_package" FOREIGN KEY ("package_id")
        REFERENCES "packages" ("id") ON DELETE RESTRICT`,
    );

    // ---------------- sms_codes ----------------
    await queryRunner.query(
      `CREATE TABLE "sms_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "mobile" varchar(16) NOT NULL,
        "code" varchar(8) NOT NULL,
        "purpose" sms_codes_purpose_enum NOT NULL,
        "expired_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_sms_codes" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sms_codes_mobile_purpose_created" ON "sms_codes" ("mobile", "purpose", "created_at" DESC)`,
    );

    // ---------------- notifications ----------------
    await queryRunner.query(
      `CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" notifications_type_enum NOT NULL,
        "title" varchar(128) NOT NULL,
        "content" text,
        "data" jsonb,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_notifications" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_id_is_read" ON "notifications" ("user_id", "is_read")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications"
        ADD CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id")
        REFERENCES "users" ("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sms_codes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "generation_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "works"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "avatar_groups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sms_codes_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_packages_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "orders_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "packages_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "packages_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "generation_tasks_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "generation_tasks_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "works_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "works_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "avatar_groups_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "avatar_groups_authorization_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "assets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "assets_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_status_enum"`);
  }
}
