/**
 * MockWechatAdapter 单元测试
 */
import { MockWechatAdapter } from './mock-wechat.adapter'

describe('MockWechatAdapter', () => {
  const adapter = new MockWechatAdapter()

  it('isMock = true', () => {
    expect(adapter.isMock).toBe(true)
  })

  it('同一个 code 返回同一个 openid（稳定）', async () => {
    const a = await adapter.code2session('code-1')
    const b = await adapter.code2session('code-1')
    expect(a.openid).toBe(b.openid)
    expect(a.openid).toMatch(/^mock_openid_/)
    expect(a.sessionKey).toMatch(/^mock_session_key_/)
    expect(a.unionid).toBeNull()
  })

  it('不同 code 返回不同 openid', async () => {
    const a = await adapter.code2session('code-1')
    const b = await adapter.code2session('code-2')
    expect(a.openid).not.toBe(b.openid)
  })

  it('返回值结构完整', async () => {
    const r = await adapter.code2session('abc')
    expect(r).toHaveProperty('openid')
    expect(r).toHaveProperty('sessionKey')
    expect(r).toHaveProperty('unionid')
    expect(typeof r.openid).toBe('string')
  })
})
