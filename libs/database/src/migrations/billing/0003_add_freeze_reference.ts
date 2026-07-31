import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 将结算/释放流水关联回原冻结流水，并保证每笔全额预留只有一个终态。
 * 历史流水保留 NULL，须在上线前人工对账，不能从描述字段猜测关联关系。
 */
export class AddFreezeReference1700000000010 implements MigrationInterface {
  name = 'AddFreezeReference1700000000010'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "point_transactions" ADD COLUMN IF NOT EXISTS "freeze_id" uuid',
    )
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_point_transactions_freeze_type" ON "point_transactions" ("freeze_id", "type")',
    )
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_point_transactions_terminal_freeze" ON "point_transactions" ("freeze_id") WHERE "type" IN (\'SETTLE\', \'RELEASE\')',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_point_transactions_terminal_freeze"')
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_point_transactions_freeze_type"')
    await queryRunner.query('ALTER TABLE "point_transactions" DROP COLUMN IF EXISTS "freeze_id"')
  }
}
