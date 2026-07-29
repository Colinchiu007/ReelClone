import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * main 库用户角色字段迁移
 *
 * 为 users 表增加 role 字段，支持 RBAC：
 *  - role: 用户角色（USER / ADMIN / SUPER_ADMIN），默认 USER
 *
 * 使用独立枚举类型 users_role_enum，与现有 users_status_enum 解耦。
 */
export class AddUserRole1700000000004 implements MigrationInterface {
  name = 'AddUserRole1700000000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- 创建枚举类型 ----------------
    // 注意：不要在事务块中包裹 ALTER TYPE ... ADD VALUE（PostgreSQL 限制）。
    // CREATE TYPE 本身可在事务中执行，这里保持与 0002_add_ugc_fields 一致的写法。
    await queryRunner.query(`CREATE TYPE users_role_enum AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN')`)

    // ---------------- 新增字段 ----------------
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "role" users_role_enum NOT NULL DEFAULT 'USER'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除字段
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`)

    // 删除枚举
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`)
  }
}
