/**
 * resolveSmsProfile 单元测试
 *
 * 重点验证：
 *  - test profile 始终允许 Mock
 *  - SMS_PROVIDER=aliyun（默认）/ tencent 切换 provider
 *  - production/staging 缺凭证 → 抛错（fail closed）
 *  - production/staging 启用 SMS_MOCK_MODE 或 SMS_PROVIDER=mock → 抛错
 *  - createSmsAdapter 根据 profile 返回正确类型的 adapter 实例
 */
import { resolveSmsProfile } from '../sms-profile'
import { createSmsAdapter } from '../sms.module'
import { MockSmsAdapter } from '../mock-sms.adapter'
import { AliyunSmsAdapter } from '../aliyun-sms.adapter'
import { TencentSmsAdapter } from '../tencent-sms.adapter'

describe('resolveSmsProfile', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function setEnv(overrides: Record<string, string | undefined>): void {
    // 清空相关变量
    delete process.env.NODE_ENV
    delete process.env.RUNTIME_PROFILE
    delete process.env.SMS_MOCK_MODE
    delete process.env.SMS_PROVIDER
    delete process.env.SMS_ALIYUN_ACCESS_KEY_ID
    delete process.env.SMS_ALIYUN_ACCESS_KEY_SECRET
    delete process.env.SMS_ALIYUN_SIGN_NAME
    delete process.env.SMS_TENCENT_SECRET_ID
    delete process.env.SMS_TENCENT_SECRET_KEY
    delete process.env.SMS_TENCENT_SDK_APP_ID
    delete process.env.SMS_TENCENT_SIGN_NAME
    Object.assign(process.env, overrides)
  }

  // -------------------- test profile --------------------

  it('NODE_ENV=test 时返回 test profile（允许 Mock，不校验凭证）', () => {
    setEnv({ NODE_ENV: 'test' })
    const r = resolveSmsProfile()
    expect(r.profile).toBe('test')
  })

  it('RUNTIME_PROFILE=test 时返回 test profile', () => {
    setEnv({ RUNTIME_PROFILE: 'test' })
    const r = resolveSmsProfile()
    expect(r.profile).toBe('test')
  })

  it('开发环境 SMS_MOCK_MODE=true 时返回 test profile', () => {
    setEnv({ NODE_ENV: 'development', SMS_MOCK_MODE: 'true' })
    expect(resolveSmsProfile().profile).toBe('test')
  })

  it('开发环境 SMS_PROVIDER=mock 时返回 test profile', () => {
    setEnv({ NODE_ENV: 'development', SMS_PROVIDER: 'mock' })
    expect(resolveSmsProfile().profile).toBe('test')
  })

  // -------------------- real profile - aliyun --------------------

  it('具备完整阿里云凭证时返回 real + aliyun provider（默认 provider）', () => {
    setEnv({
      SMS_ALIYUN_ACCESS_KEY_ID: 'LTAI123',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 'secret123',
      SMS_ALIYUN_SIGN_NAME: 'ReelClone',
    })
    const r = resolveSmsProfile()
    expect(r.profile).toBe('real')
    expect(r.provider).toBe('aliyun')
    expect(r.aliyunAccessKeyId).toBe('LTAI123')
    expect(r.aliyunAccessKeySecret).toBe('secret123')
    expect(r.aliyunSignName).toBe('ReelClone')
  })

  it('SMS_PROVIDER 未设置时默认 aliyun', () => {
    setEnv({
      SMS_ALIYUN_ACCESS_KEY_ID: 'k',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 's',
    })
    expect(resolveSmsProfile().provider).toBe('aliyun')
  })

  it('SMS_PROVIDER=aliyun 显式选择阿里云', () => {
    setEnv({
      SMS_PROVIDER: 'aliyun',
      SMS_ALIYUN_ACCESS_KEY_ID: 'k',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 's',
    })
    expect(resolveSmsProfile().provider).toBe('aliyun')
  })

  // -------------------- real profile - tencent --------------------

  it('SMS_PROVIDER=tencent + 完整腾讯云凭证时返回 real + tencent provider', () => {
    setEnv({
      SMS_PROVIDER: 'tencent',
      SMS_TENCENT_SECRET_ID: 'sid',
      SMS_TENCENT_SECRET_KEY: 'skey',
      SMS_TENCENT_SDK_APP_ID: '1400000000',
      SMS_TENCENT_SIGN_NAME: 'ReelClone',
    })
    const r = resolveSmsProfile()
    expect(r.profile).toBe('real')
    expect(r.provider).toBe('tencent')
    expect(r.tencentSecretId).toBe('sid')
    expect(r.tencentSecretKey).toBe('skey')
    expect(r.tencentSdkAppId).toBe('1400000000')
    expect(r.tencentSignName).toBe('ReelClone')
  })

  it('SMS_PROVIDER=tencent 缺凭证时（开发环境）回退到 test profile', () => {
    setEnv({
      NODE_ENV: 'development',
      SMS_PROVIDER: 'tencent',
    })
    const r = resolveSmsProfile()
    expect(r.profile).toBe('test')
  })

  // -------------------- fail closed: production/staging --------------------

  it('production 缺阿里云凭证时抛错（fail closed）', () => {
    setEnv({ NODE_ENV: 'production' })
    expect(() => resolveSmsProfile()).toThrow(/fail closed/)
  })

  it('staging 缺阿里云凭证时抛错（fail closed）', () => {
    setEnv({ NODE_ENV: 'staging' })
    expect(() => resolveSmsProfile()).toThrow(/fail closed/)
  })

  it('production SMS_PROVIDER=tencent 缺腾讯云凭证时抛错', () => {
    setEnv({ NODE_ENV: 'production', SMS_PROVIDER: 'tencent' })
    expect(() => resolveSmsProfile()).toThrow(/fail closed/)
  })

  it('production 启用 SMS_MOCK_MODE 时抛错', () => {
    setEnv({
      NODE_ENV: 'production',
      SMS_MOCK_MODE: 'true',
      SMS_ALIYUN_ACCESS_KEY_ID: 'LTAI123',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 'secret123',
    })
    expect(() => resolveSmsProfile()).toThrow(/production\/staging 环境不被允许/)
  })

  it('production SMS_PROVIDER=mock 时抛错', () => {
    setEnv({
      NODE_ENV: 'production',
      SMS_PROVIDER: 'mock',
      SMS_ALIYUN_ACCESS_KEY_ID: 'LTAI123',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 'secret123',
    })
    expect(() => resolveSmsProfile()).toThrow(/fail closed/)
  })

  it('production 具备阿里云凭证且未启用 Mock 时返回 real + aliyun', () => {
    setEnv({
      NODE_ENV: 'production',
      SMS_ALIYUN_ACCESS_KEY_ID: 'LTAI123',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 'secret123',
    })
    expect(resolveSmsProfile().profile).toBe('real')
    expect(resolveSmsProfile().provider).toBe('aliyun')
  })

  // -------------------- dev 回退 --------------------

  it('开发环境缺凭证时回退到 test profile', () => {
    setEnv({ NODE_ENV: 'development' })
    expect(resolveSmsProfile().profile).toBe('test')
  })

  it('未设置 NODE_ENV 且缺凭证时回退到 test profile', () => {
    setEnv({})
    expect(resolveSmsProfile().profile).toBe('test')
  })

  // -------------------- 参数注入 --------------------

  it('支持显式传入 env 对象（不影响 process.env）', () => {
    const r = resolveSmsProfile({
      NODE_ENV: 'production',
      SMS_ALIYUN_ACCESS_KEY_ID: 'k',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 's',
    })
    expect(r.profile).toBe('real')
    expect(r.provider).toBe('aliyun')
  })
})

// -------------------- createSmsAdapter 工厂 --------------------

describe('createSmsAdapter', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function setEnv(overrides: Record<string, string | undefined>): void {
    delete process.env.NODE_ENV
    delete process.env.RUNTIME_PROFILE
    delete process.env.SMS_MOCK_MODE
    delete process.env.SMS_PROVIDER
    delete process.env.SMS_ALIYUN_ACCESS_KEY_ID
    delete process.env.SMS_ALIYUN_ACCESS_KEY_SECRET
    delete process.env.SMS_ALIYUN_SIGN_NAME
    delete process.env.SMS_TENCENT_SECRET_ID
    delete process.env.SMS_TENCENT_SECRET_KEY
    delete process.env.SMS_TENCENT_SDK_APP_ID
    delete process.env.SMS_TENCENT_SIGN_NAME
    Object.assign(process.env, overrides)
  }

  it('test profile 应返回 MockSmsAdapter', () => {
    setEnv({ NODE_ENV: 'test' })
    const adapter = createSmsAdapter()
    expect(adapter).toBeInstanceOf(MockSmsAdapter)
    expect(adapter.isMock).toBe(true)
  })

  it('real + aliyun 应返回 AliyunSmsAdapter', () => {
    setEnv({
      SMS_PROVIDER: 'aliyun',
      SMS_ALIYUN_ACCESS_KEY_ID: 'k',
      SMS_ALIYUN_ACCESS_KEY_SECRET: 's',
    })
    const adapter = createSmsAdapter()
    expect(adapter).toBeInstanceOf(AliyunSmsAdapter)
    expect(adapter.isMock).toBe(false)
  })

  it('real + tencent 应返回 TencentSmsAdapter', () => {
    setEnv({
      SMS_PROVIDER: 'tencent',
      SMS_TENCENT_SECRET_ID: 'sid',
      SMS_TENCENT_SECRET_KEY: 'skey',
      SMS_TENCENT_SDK_APP_ID: '1400000000',
    })
    const adapter = createSmsAdapter()
    expect(adapter).toBeInstanceOf(TencentSmsAdapter)
    expect(adapter.isMock).toBe(false)
  })

  it('production 缺凭证应抛错（fail closed，阻止启动）', () => {
    setEnv({ NODE_ENV: 'production' })
    expect(() => createSmsAdapter()).toThrow(/fail closed/)
  })
})
