import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 为 users 表增加 token_version 列，支持 JWT 撤权。
 *
 * - 密码修改、账户冻结/注销时递增 tokenVersion
 * - 校验 JWT 时比对 token.version < user.tokenVersion → 拒绝
 */
export class AddTokenVersionToUser1722600000000 implements MigrationInterface {
  name = 'AddTokenVersionToUser1722600000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "token_version" integer NOT NULL DEFAULT 0`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "token_version"`)
  }
}
