import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 为 V2 billing 投影保留 main 库 CreditReservation 的逻辑关联。
 *
 * billing 与 main 是独立数据库，不能建立外键；历史流水也没有可靠关联，故保持
 * NULL，不从旧 freeze_id、描述或金额推测回填。
 */
export class AddReservationId1700000000012 implements MigrationInterface {
  name = 'AddReservationId1700000000012'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "point_transactions" ADD COLUMN IF NOT EXISTS "reservation_id" uuid',
    )
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_point_transactions_reservation_type" ON "point_transactions" ("reservation_id", "type")',
    )
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_point_transactions_terminal_reservation" ON "point_transactions" ("reservation_id") WHERE "reservation_id" IS NOT NULL AND "type" IN (\'SETTLE\', \'RELEASE\')',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_point_transactions_terminal_reservation"')
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_point_transactions_reservation_type"')
    await queryRunner.query(
      'ALTER TABLE "point_transactions" DROP COLUMN IF EXISTS "reservation_id"',
    )
  }
}
