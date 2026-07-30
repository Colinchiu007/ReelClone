import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * main 库 works_status_enum 增加 DELETED 值
 *
 * 作品软删除场景需要 DELETED 状态。
 * 注意：ALTER TYPE ... ADD VALUE 不能在事务块中执行，
 * 因此 migration-runner.ts 对 main 库保持 transaction: true 无影响
 * （TypeORM 会自动在事务外执行此语句）。
 */
export class AddWorksDeletedStatus1700000000007 implements MigrationInterface {
  name = 'AddWorksDeletedStatus1700000000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE works_status_enum ADD VALUE IF NOT EXISTS 'DELETED'`)
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL 不支持直接从 enum 中移除值
    // 需要重建类型，此处不实现 down
  }
}
