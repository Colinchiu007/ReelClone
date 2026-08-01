/**
 * MockWechatAdapter
 *
 * 基于 code 生成稳定的假 openid/sessionKey，便于本地无凭证联调与单元测试。
 * 同一个 code 总是返回同一个 openid。
 */
import { createHash } from 'crypto'
import type { WechatAdapter, WechatSession } from './wechat-adapter.interface'

export class MockWechatAdapter implements WechatAdapter {
  readonly isMock = true

  async code2session(code: string): Promise<WechatSession> {
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 16)
    return {
      openid: `mock_openid_${hash}`,
      sessionKey: `mock_session_key_${hash}`,
      unionid: null,
    }
  }
}
