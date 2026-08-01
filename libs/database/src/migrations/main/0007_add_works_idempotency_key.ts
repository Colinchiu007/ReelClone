import { MigrationInterface, QueryRunner } from 'typeorm'

/** 为生成请求提供数据库层幂等兜底，避免 Redis 锁失效时重复创建 Work。 */
export class AddWorksIdempotencyKey1700000000009 implements MigrationInterface {
  name = 'AddWorksIdempotencyKey1700000000009'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "works" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128)',
    )
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_works_user_idempotency_key" ON "works" ("user_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL',
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_works_user_idempotency_key"')
    await queryRunner.query('ALTER TABLE "works" DROP COLUMN IF EXISTS "idempotency_key"')
  }
}
