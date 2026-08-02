/**
 * MockWechatPayAdapter — 微信支付 Mock 适配器
 *
 * 仅用于 test profile（本地联调 / 单元测试）：
 *  - verifyNotification: 跳过验签直接返回 verified=true
 *  - decryptResource: 直接返回 ciphertext 原文（假设 ciphertext 即为 JSON 明文）
 *
 * production/staging 环境禁止绑定此适配器（由 resolveWechatPayProfile fail-closed 保证）。
 */
import type { IWechatPayAdapter, WechatPayNotification } from './wechat-pay-adapter.interface'

export class MockWechatPayAdapter implements IWechatPayAdapter {
  readonly isMock = true

  async verifyNotification(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<WechatPayNotification> {
    // Mock 模式不校验签名，直接返回通过
    const serial = this.extractHeader(headers, 'wechatpay-serial') ?? ''
    const timestamp = this.extractHeader(headers, 'wechatpay-timestamp') ?? ''
    const nonce = this.extractHeader(headers, 'wechatpay-nonce') ?? ''

    let parsedBody: WechatPayNotification['body']
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = undefined
    }

    return {
      verified: true,
      serial,
      timestamp,
      nonce,
      rawBody,
      body: parsedBody,
    }
  }

  decryptResource(ciphertext: string, _associatedData: string, _nonce: string): string {
    // Mock 模式：ciphertext 即为明文 JSON
    return ciphertext
  }

  buildAuthorization(_method: string, _url: string, _body: string): string {
    // Mock 模式返回固定签名头（不需要真实签名）
    return 'WECHATPAY2-SHA256-RSA2048 mchid="mock_mchid",nonce_str="mock_nonce",timestamp="0",serial_no="mock_serial",signature="mock_signature"'
  }

  /** 大小写不敏感地提取 header 值 */
  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = name.toLowerCase()
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) {
        return typeof value === 'string' ? value : value?.[0]
      }
    }
    return undefined
  }
}
