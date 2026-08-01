import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 为 user_packages.order_id 添加 partial unique 索引。
 *
 * 防止同一订单重复绑定到多个 user_package，保证 paid-grant 幂等性：
 * 即使支付回调被并发处理，同一订单也只能创建一个 UserPackage。
 *
 * 使用 WHERE order_id IS NOT NULL 的 partial index，避免历史无 order_id
 * 的记录（NULL）触发唯一约束冲突。
 */
export class AddUserPackageOrderIdUnique1700000000015 implements MigrationInterface {
  name = 'AddUserPackageOrderIdUnique1700000000015'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_packages_order_id"
        ON "user_packages" ("order_id")
        WHERE "order_id" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_packages_order_id"`)
  }
}
