import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 为 sms_codes 表添加 provider_message_id 字段。
 *
 * 用于记录 SMS provider 返回的回执 ID（阿里云 BizId / 腾讯云 SerialNo / Mock 合成值），
 * 便于后续状态查询（如调用阿里云 QuerySendDetails 接口）。
 *
 * nullable=true 保证历史数据迁移时不受影响（无 messageId 的记录保留 NULL）。
 */
export class AddSmsCodeProviderMessageId1700000000016 implements MigrationInterface {
  name = 'AddSmsCodeProviderMessageId1700000000016'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sms_codes"
        ADD COLUMN IF NOT EXISTS "provider_message_id" varchar(128) NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sms_codes" DROP COLUMN IF EXISTS "provider_message_id"`)
  }
}
