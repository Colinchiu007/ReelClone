import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * main 库系统配置表迁移
 *
 * 创建 system_config 表，用于运行时存储 API Key 等可热刷新的配置项。
 * 配合 ConfigStoreService（Redis 缓存 + Pub/Sub）实现 Key 热刷新。
 *
 * 字段：
 *  - id: uuid 主键
 *  - config_key: 配置键（唯一，如 seedance_api_keys）
 *  - config_value: 配置值（text，API Key 以逗号分隔）
 *  - description: 描述（可空）
 *  - updated_at: 更新时间
 */
export class AddSystemConfig1700000000005 implements MigrationInterface {
  name = 'AddSystemConfig1700000000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "system_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "config_key" varchar(128) NOT NULL,
        "config_value" text NOT NULL,
        "description" varchar(256),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_system_config_config_key" UNIQUE ("config_key"),
        CONSTRAINT "pk_system_config" PRIMARY KEY ("id")
      )`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "system_config"`)
  }
}
