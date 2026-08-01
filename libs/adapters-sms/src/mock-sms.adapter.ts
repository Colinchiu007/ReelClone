/**
 * MockSmsAdapter
 *
 * 开发/测试模式适配器：
 *  - sendSms 仅通过 Logger 打印，不真实发送短信
 *  - 返回合成的 messageId（mock- 前缀 + 时间戳），便于测试断言与状态查询流程演练
 *
 * 此 adapter 仅在 test profile 下绑定：
 *  - NODE_ENV=test / RUNTIME_PROFILE=test / SMS_MOCK_MODE=true（仅开发环境）→ test profile
 *  - production/staging 不会绑定此适配器（由 resolveSmsProfile fail closed 保证）
 *
 * 注意：Mock 模式下不应触发真实 SMS 计费，因此本类不发起任何网络请求。
 */
import { Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { SmsAdapter, SmsSendResult } from './sms.adapter'

export class MockSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(MockSmsAdapter.name)
  readonly isMock = true

  async sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<SmsSendResult> {
    // 脱敏：仅打印模板参数的 key（避免验证码或敏感参数泄漏到日志）
    const paramKeys = Object.keys(params).join(',')
    this.logger.log(`[Mock SMS] phone=${phone}, template=${templateCode}, params=[${paramKeys}]`)

    return {
      // 合成 messageId，便于业务流程演练（如 SmsService 写入 DB 后状态查询）
      messageId: `mock-${randomUUID()}`,
      status: 'sent',
    }
  }
}
