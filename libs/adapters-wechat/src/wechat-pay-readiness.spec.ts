/**
 * WechatPay 生产环境就绪检查（fail-closed）测试
 *
 * 验证 createWechatPayAdapter + resolveWechatPayProfile 在各环境下的行为：
 *  1. production 缺凭证 → 抛错拒绝启动（fail-closed）
 *  2. staging 缺凭证 → 抛错拒绝启动（fail-closed）
 *  3. test profile → 允许 Mock 适配器
 *  4. development 缺凭证 → 回退到 Mock
 *  5. production 有完整凭证 → 创建 Real 适配器 + 运行自检
 *  6. production 自检失败 → 抛错拒绝启动
 *  7. production 凭证不完整（缺 apiV3Key）→ 抛错
 *  8. production 凭证不完整（缺 privateKey）→ 抛错
 *
 * 此测试确保资金安全：生产环境永远不会以 Mock 模式或未验签模式运行。
 */
import * as crypto from 'crypto'
import { createWechatPayAdapter } from './wechat-pay-adapter.module'
import { resolveWechatPayProfile } from './wechat-pay-profile'
import { MockWechatPayAdapter } from './mock-wechat-pay.adapter'
import { RealWechatPayAdapter } from './wechat-pay.adapter'

/** 构造完整凭证环境变量 */
function fullCredentialsEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    WECHAT_PAY_MCHID: '1900000001',
    WECHAT_PAY_APPID: 'wx8888888888888888',
    WECHAT_PAY_API_V3_KEY: 'reelclone_prod_apiv3key_32bytes!',
    WECHAT_PAY_SERIAL_NO: 'PROD_SERIAL_NO_00000000001',
    WECHAT_PAY_PRIVATE_KEY_PEM: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDB1234567890
-----END PRIVATE KEY-----`,
  }
}

describe('WechatPay 生产环境就绪检查（fail-closed）', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv }
  })

  // -------------------- profile 解析 --------------------

  describe('resolveWechatPayProfile', () => {
    it('production 缺凭证时应抛错（fail-closed）', () => {
      expect(() =>
        resolveWechatPayProfile({
          NODE_ENV: 'production',
          WECHAT_PAY_MCHID: '',
        }),
      ).toThrow(/fail closed/)
    })

    it('staging 缺凭证时应抛错（fail-closed）', () => {
      expect(() =>
        resolveWechatPayProfile({
          NODE_ENV: 'staging',
          WECHAT_PAY_MCHID: '',
        }),
      ).toThrow(/fail closed/)
    })

    it('test profile 始终允许 Mock（不校验凭证）', () => {
      const result = resolveWechatPayProfile({
        NODE_ENV: 'test',
        WECHAT_PAY_MCHID: '',
      })
      expect(result.profile).toBe('test')
    })

    it('RUNTIME_PROFILE=test 始终允许 Mock', () => {
      const result = resolveWechatPayProfile({
        NODE_ENV: 'production',
        RUNTIME_PROFILE: 'test',
        WECHAT_PAY_MCHID: '',
      })
      expect(result.profile).toBe('test')
    })

    it('development 缺凭证时回退到 Mock', () => {
      const result = resolveWechatPayProfile({
        NODE_ENV: 'development',
        WECHAT_PAY_MCHID: '',
      })
      expect(result.profile).toBe('test')
    })

    it('production 有完整凭证时返回 real profile', () => {
      const result = resolveWechatPayProfile(fullCredentialsEnv())
      expect(result.profile).toBe('real')
      expect(result.mchId).toBe('1900000001')
      expect(result.appId).toBe('wx8888888888888888')
    })

    it('production 凭证不完整（缺 apiV3Key）时抛错', () => {
      const env = fullCredentialsEnv()
      delete env.WECHAT_PAY_API_V3_KEY
      expect(() => resolveWechatPayProfile(env)).toThrow(/fail closed/)
    })

    it('production 凭证不完整（缺 privateKey）时抛错', () => {
      const env = fullCredentialsEnv()
      delete env.WECHAT_PAY_PRIVATE_KEY_PEM
      delete env.WECHAT_PAY_PRIVATE_KEY_PATH
      expect(() => resolveWechatPayProfile(env)).toThrow(/fail closed/)
    })

    it('production 凭证不完整（缺 serialNo）时抛错', () => {
      const env = fullCredentialsEnv()
      delete env.WECHAT_PAY_SERIAL_NO
      expect(() => resolveWechatPayProfile(env)).toThrow(/fail closed/)
    })

    it('production 凭证不完整（缺 appId）时抛错', () => {
      const env = fullCredentialsEnv()
      delete env.WECHAT_PAY_APPID
      expect(() => resolveWechatPayProfile(env)).toThrow(/fail closed/)
    })
  })

  // -------------------- 适配器创建 --------------------

  describe('createWechatPayAdapter', () => {
    it('test profile 应返回 MockWechatPayAdapter', async () => {
      const adapter = await createWechatPayAdapter({
        NODE_ENV: 'test',
        WECHAT_PAY_MCHID: '',
      })
      expect(adapter).toBeInstanceOf(MockWechatPayAdapter)
      expect(adapter.isMock).toBe(true)
    })

    it('development 缺凭证时应返回 MockWechatPayAdapter', async () => {
      const adapter = await createWechatPayAdapter({
        NODE_ENV: 'development',
        WECHAT_PAY_MCHID: '',
      })
      expect(adapter).toBeInstanceOf(MockWechatPayAdapter)
      expect(adapter.isMock).toBe(true)
    })

    it('production 缺凭证时应抛错（fail-closed）', async () => {
      await expect(
        createWechatPayAdapter({
          NODE_ENV: 'production',
          WECHAT_PAY_MCHID: '',
        }),
      ).rejects.toThrow(/fail closed/)
    })

    it('staging 缺凭证时应抛错（fail-closed）', async () => {
      await expect(
        createWechatPayAdapter({
          NODE_ENV: 'staging',
          WECHAT_PAY_MCHID: '',
        }),
      ).rejects.toThrow(/fail closed/)
    })

    it('production 有完整凭证时应创建 RealWechatPayAdapter 并运行自检', async () => {
      // 使用完整凭证 + 有效的 RSA 私钥（动态生成）
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      })

      const adapter = await createWechatPayAdapter({
        ...fullCredentialsEnv(),
        WECHAT_PAY_PRIVATE_KEY_PEM: privateKey,
      })

      expect(adapter).toBeInstanceOf(RealWechatPayAdapter)
      expect(adapter.isMock).toBe(false)
    })

    it('production 自检失败时应抛错（fail-closed）', async () => {
      // 使用无效私钥（格式正确但不是有效 RSA 私钥的 PEM）
      // createWechatPayAdapter 会在 runSelfTest 中失败
      const invalidKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDBinvalidkey123
-----END PRIVATE KEY-----`

      await expect(
        createWechatPayAdapter({
          ...fullCredentialsEnv(),
          WECHAT_PAY_PRIVATE_KEY_PEM: invalidKey,
        }),
      ).rejects.toThrow()
    })

    it('RUNTIME_PROFILE=test 在 production 下仍允许 Mock', async () => {
      const adapter = await createWechatPayAdapter({
        NODE_ENV: 'production',
        RUNTIME_PROFILE: 'test',
        WECHAT_PAY_MCHID: '',
      })
      expect(adapter).toBeInstanceOf(MockWechatPayAdapter)
      expect(adapter.isMock).toBe(true)
    })
  })
})
