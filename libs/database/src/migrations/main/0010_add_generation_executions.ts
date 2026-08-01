import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 在 main 库内建立生成 saga 的 durable execution 权威记录。
 *
 * GenerationExecution 承载一次生成 saga 从发起到完成的全部状态机演进，
 * 作为 durable reconciler 的基础，闭合 provider_state_unknown 等状态的
 * 恢复路径。历史生成任务没有对应的 execution 记录，本迁移只创建新结构，
 * 绝不回填。
 */
export class AddGenerationExecutions1700000000014 implements MigrationInterface {
  name = 'AddGenerationExecutions1700000000014'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "generation_executions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "work_id" uuid NOT NULL,
        "task_id" uuid,
        "request_fingerprint" varchar NOT NULL,
        "provider_token" varchar,
        "workflow_id" varchar NOT NULL,
        "billing_operation_id" uuid NOT NULL,
        "reservation_id" uuid NOT NULL,
        "stage" varchar(30) NOT NULL,
        "attempt" integer NOT NULL DEFAULT 0,
        "recovery_deadline" timestamptz,
        "reconciler_owner" uuid,
        "last_reconciled_at" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_generation_executions" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_generation_executions_work_task"
        ON "generation_executions" ("work_id", "task_id")
        WHERE "task_id" IS NOT NULL`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_generation_executions_request_fingerprint"
        ON "generation_executions" ("request_fingerprint")`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_generation_executions_workflow_id"
        ON "generation_executions" ("workflow_id")`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_generation_executions_reconciler"
        ON "generation_executions" ("stage", "recovery_deadline")
        WHERE "stage" IN ('PROVIDER_STATE_UNKNOWN', 'PROVIDER_CANCEL_PENDING', 'WORKFLOW_START_UNKNOWN', 'BILLING_RELEASE_PENDING')`,
    )
    await queryRunner.query(
      `CREATE INDEX "IDX_generation_executions_work_id"
        ON "generation_executions" ("work_id")`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_generation_executions_work_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_generation_executions_reconciler"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_generation_executions_workflow_id"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_generation_executions_request_fingerprint"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_generation_executions_work_task"`)
    await queryRunner.query('DROP TABLE IF EXISTS "generation_executions"')
  }
}
