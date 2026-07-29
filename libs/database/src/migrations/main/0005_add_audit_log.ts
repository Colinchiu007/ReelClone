import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * main 库审计日志表迁移
 *
 * 创建 audit_log 表，记录管理后台所有敏感操作（退款、封禁、调账、审核、Key 更新等）。
 * 满足合规审计与事后追溯需求。
 *
 * 索引：
 *  - operator_id: 按操作者查询
 *  - action: 按操作类型查询
 *  - (target_type, target_id): 按目标对象查询
 *  - created_at: 按时间范围查询
 */
export class AddAuditLog1700000000006 implements MigrationInterface {
  name = 'AddAuditLog1700000000006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "operator_id" varchar(64) NOT NULL,
        "operator_role" varchar(32) NOT NULL,
        "action" varchar(64) NOT NULL,
        "target_type" varchar(64) NOT NULL,
        "target_id" varchar(64) NOT NULL,
        "detail" jsonb,
        "result" varchar(16) NOT NULL DEFAULT 'SUCCESS',
        "ip" varchar(64),
        "user_agent" varchar(256),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_log" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(`CREATE INDEX "idx_audit_log_operator" ON "audit_log" ("operator_id")`)
    await queryRunner.query(`CREATE INDEX "idx_audit_log_action" ON "audit_log" ("action")`)
    await queryRunner.query(
      `CREATE INDEX "idx_audit_log_target" ON "audit_log" ("target_type", "target_id")`,
    )
    await queryRunner.query(`CREATE INDEX "idx_audit_log_created_at" ON "audit_log" ("created_at")`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`)
  }
}
