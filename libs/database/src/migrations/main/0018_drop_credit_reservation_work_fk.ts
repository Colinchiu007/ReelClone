import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 移除 credit_reservations.work_id 的外键约束。
 *
 * 根因：benchmark-service 传入 benchmarkId 作为 workId，但 benchmark
 * 不是 Work 实体，FK 约束导致 'insert or update on table
 * credit_reservations violates foreign key constraint fk_credit_reservations_work'。
 *
 * work_id 是逻辑引用（生成链路指向 works.id，对标链路指向 benchmarks.id），
 * 不应强制物理 FK。billing_projection_outbox.work_id 同理。
 */
export class DropCreditReservationWorkFk1700000000018 implements MigrationInterface {
  name = 'DropCreditReservationWorkFk1700000000018'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credit_reservations" DROP CONSTRAINT IF EXISTS "fk_credit_reservations_work"`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "credit_reservations"
        ADD CONSTRAINT "fk_credit_reservations_work" FOREIGN KEY ("work_id")
        REFERENCES "works" ("id") ON DELETE RESTRICT`,
    )
  }
}
