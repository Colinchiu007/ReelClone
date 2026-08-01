/**
 * MockSmsAdapter 单元测试
 *
 * 验证返回结构符合 SmsAdapter 契约：
 *  - isMock 为 true
 *  - sendSms 不抛错
 *  - 返回 { messageId, status: 'sent' }，messageId 以 "mock-" 前缀
 *  - 不发起任何网络请求（Mock 模式不应触发真实 SMS 计费）
 */
import axios from 'axios'
import { MockSmsAdapter } from '../mock-sms.adapter'

describe('MockSmsAdapter', () => {
  let adapter: MockSmsAdapter

  beforeEach(() => {
    adapter = new MockSmsAdapter()
  })

  it('isMock 为 true', () => {
    expect(adapter.isMock).toBe(true)
  })

  it('sendSms 返回 { messageId, status: "sent" } 结构', async () => {
    const result = await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
      code: '123456',
    })

    expect(result).toHaveProperty('messageId')
    expect(result).toHaveProperty('status')
    expect(typeof result.messageId).toBe('string')
    expect(result.status).toBe('sent')
  })

  it('messageId 应以 "mock-" 前缀（便于区分真实 messageId 与 Mock 合成值）', async () => {
    const result = await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', {
      code: '123456',
    })

    expect(result.messageId.startsWith('mock-')).toBe(true)
  })

  it('多次调用应返回不同的 messageId（基于 randomUUID）', async () => {
    const a = await adapter.sendSms('13800138000', 'SMS_T', { code: '1' })
    const b = await adapter.sendSms('13800138000', 'SMS_T', { code: '2' })

    expect(a.messageId).not.toBe(b.messageId)
  })

  it('sendSms 不应发起任何网络请求', async () => {
    // 不 mock axios，验证 adapter 不会调用 axios
    // 通过检查 axios.get / axios.post 未被调用来确认
    const getSpy = jest.spyOn(axios, 'get')
    const postSpy = jest.spyOn(axios, 'post')

    await adapter.sendSms('13800138000', 'SMS_TEMPLATE_TEST', { code: '123456' })

    expect(getSpy).not.toHaveBeenCalled()
    expect(postSpy).not.toHaveBeenCalled()

    getSpy.mockRestore()
    postSpy.mockRestore()
  })

  it('应接受任意 templateCode 与 params（透传，不校验业务字段）', async () => {
    await expect(
      adapter.sendSms('13900139000', 'ANY_TEMPLATE', {
        code: 'abc',
        product: 'reelclone',
      }),
    ).resolves.toMatchObject({ status: 'sent' })
  })
})
