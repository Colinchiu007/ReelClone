/**
 * createWechatAdapter / WechatAdapterModule 单元测试
 *
 * 验证运行时绑定：test profile → MockWechatAdapter，real profile → RealWechatAdapter，
 * production/staging 缺凭证 → 抛错。
 */
import {
  createWechatAdapter,
  MockWechatAdapter,
  RealWechatAdapter,
  WechatAdapterModule,
} from './index'

describe('createWechatAdapter', () => {
  it('test profile → MockWechatAdapter', () => {
    const adapter = createWechatAdapter({ NODE_ENV: 'test' })
    expect(adapter).toBeInstanceOf(MockWechatAdapter)
    expect(adapter.isMock).toBe(true)
  })

  it('RUNTIME_PROFILE=test → MockWechatAdapter', () => {
    const adapter = createWechatAdapter({
      NODE_ENV: 'development',
      RUNTIME_PROFILE: 'test',
    })
    expect(adapter).toBeInstanceOf(MockWechatAdapter)
  })

  it('WECHAT_MOCK_MODE=true → MockWechatAdapter', () => {
    const adapter = createWechatAdapter({
      NODE_ENV: 'production',
      WECHAT_MOCK_MODE: 'true',
    })
    expect(adapter).toBeInstanceOf(MockWechatAdapter)
    expect(adapter.isMock).toBe(true)
  })

  it('real profile → RealWechatAdapter', () => {
    const adapter = createWechatAdapter({
      NODE_ENV: 'production',
      WECHAT_APPID: 'wx',
      WECHAT_SECRET: 's',
    })
    expect(adapter).toBeInstanceOf(RealWechatAdapter)
    expect(adapter.isMock).toBe(false)
  })

  it('production 缺凭证 → 抛错', () => {
    expect(() => createWechatAdapter({ NODE_ENV: 'production' })).toThrow(/fail closed/)
  })

  it('staging 缺凭证 → 抛错', () => {
    expect(() => createWechatAdapter({ NODE_ENV: 'staging' })).toThrow(/fail closed/)
  })

  it('development 缺凭证 → MockWechatAdapter（回退）', () => {
    const adapter = createWechatAdapter({ NODE_ENV: 'development' })
    expect(adapter).toBeInstanceOf(MockWechatAdapter)
  })
})

describe('WechatAdapterModule', () => {
  it('模块类可被引用', () => {
    expect(WechatAdapterModule).toBeDefined()
  })
})
