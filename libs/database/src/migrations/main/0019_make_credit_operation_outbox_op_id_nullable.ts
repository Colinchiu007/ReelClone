import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 将 credit_operation_outbox.credit_operation_id 改为可空。
 *
 * 根因：B5 重构后 order-service 在支付回调事务中仅写入 outbox「意图」
 * （creditOperationId 传 undefined，由 TypeORM 编译为 DEFAULT），
 * 权威的 CreditOperation 由 billing-service 执行 grant 时创建并回填。
 * 但该列定义为 NOT NULL 且无 DEFAULT，导致插入报
 * 'null value in column "credit_operation_id" violates not-null constraint'，
 * 支付回调事务整体回滚，订单无法流转为 PAID。
 *
 * 逻辑关联说明：creditOperationId 与 CreditOperation.id 为逻辑关联，
 * 由 outbox consumer 在投递成功后按需回查/更新，不依赖数据库层 FK 强约束。
 */
export class MakeCreditOperationOutboxOpIdNullable1700000000019 implements MigrationInterface {
  name = 'MakeCreditOperationOutboxOpIdNullable1700000000019'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 先删除物理 FK（nullable 列无需保留，逻辑关联即可；且 billing 侧创建记录前无值可引用）
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        DROP CONSTRAINT IF EXISTS "fk_credit_operation_outbox_credit_operation"`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        ALTER COLUMN "credit_operation_id" DROP NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        ALTER COLUMN "credit_operation_id" SET NOT NULL`,
    )
    await queryRunner.query(
      `ALTER TABLE "credit_operation_outbox"
        ADD CONSTRAINT "fk_credit_operation_outbox_credit_operation"
        FOREIGN KEY ("credit_operation_id")
        REFERENCES "credit_operations" ("id") ON DELETE RESTRICT`,
    )
  }
}
