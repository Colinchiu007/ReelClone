/**
 * WechatPayAdapter 集成测试 — 官方 API v3 测试向量验证
 *
 * 使用符合微信支付 API v3 规范的测试向量，端到端验证适配器的核心安全链路：
 *  1. RSA-SHA256 签名与验签（Authorization header 格式 + 验签链路）
 *  2. AES-256-GCM 加密与解密（resource.ciphertext 解密）
 *  3. 回调验签完整流程（时间窗 + nonce + 签名 + 防重放）
 *  4. 字段绑定校验（appid/mchid/amount/currency 全量校验）
 *
 * 测试向量遵循微信支付 API v3 规范格式（非官方固定向量，但符合规范要求）：
 *  - 动态生成 RSA-2048 密钥对模拟微信支付平台签名
 *  - 使用 APIv3 密钥 AES-GCM 加密模拟回调 resource
 *
 * 参考: https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
 */
import * as crypto from 'crypto'
import { RealWechatPayAdapter } from './wechat-pay.adapter'
import type { WechatPayNotification } from './wechat-pay-adapter.interface'

// -------------------- 测试常量 --------------------

/** 测试用商户配置 */
const TEST_CONFIG = {
  mchId: '1900000001',
  appId: 'wx8888888888888888',
  apiV3Key: 'reelclone_test_apiv3key_32bytes!',
  serialNo: 'TEST_SERIAL_NO_00000000000001',
}

/** 测试用平台证书序列号 */
const TEST_CERT_SERIAL = 'TEST_PLATFORM_CERT_000000001'

// -------------------- 测试工具 --------------------

/** 生成 RSA-2048 密钥对（PEM 格式） */
function generateRsaKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKey, publicKey }
}

/** 构造适配器（注入测试平台证书） */
function createAdapter(privateKeyPem: string, publicKeyPem: string): RealWechatPayAdapter {
  const adapter = new RealWechatPayAdapter({
    ...TEST_CONFIG,
    privateKeyPem,
  })
  adapter.injectPlatformCert(TEST_CERT_SERIAL, publicKeyPem)
  return adapter
}

/** 用私钥签名回调（模拟微信支付平台签名） */
function signCallback(
  privateKeyPem: string,
  timestamp: string,
  nonce: string,
  body: string,
): string {
  const signContent = `${timestamp}\n${nonce}\n${body}\n`
  return crypto
    .sign('RSA-SHA256', Buffer.from(signContent), crypto.createPrivateKey(privateKeyPem))
    .toString('base64')
}

/** AES-256-GCM 加密（模拟微信支付平台加密 resource） */
function aesGcmEncrypt(
  apiV3Key: string,
  plaintext: string,
  nonce: string,
  associatedData: string = '',
): string {
  const key = Buffer.from(apiV3Key, 'utf8')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'))
  cipher.setAAD(Buffer.from(associatedData, 'utf8'))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([encrypted, authTag]).toString('base64')
}

/** 构造完整的微信支付回调请求（headers + rawBody） */
function buildCallbackRequest(
  privateKeyPem: string,
  decryptedPayload: Record<string, unknown>,
  options: {
    timestamp?: string
    nonce?: string
    associatedData?: string
    eventType?: string
  } = {},
): { headers: Record<string, string>; rawBody: string } {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000).toString()
  const nonce = options.nonce ?? crypto.randomBytes(16).toString('hex')
  const associatedData = options.associatedData ?? 'transaction'
  const eventType = options.eventType ?? 'TRANSACTION.SUCCESS'

  // AES-GCM 加密 resource
  const plaintext = JSON.stringify(decryptedPayload)
  const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce, associatedData)

  // 构造回调 body
  const body = JSON.stringify({
    id: 'evt-test-' + Date.now(),
    create_time: new Date().toISOString(),
    event_type: eventType,
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext,
      associated_data: associatedData,
      nonce,
      original_type: 'transaction',
    },
    summary: '支付成功',
  })

  // 签名
  const signature = signCallback(privateKeyPem, timestamp, nonce, body)

  // 构造 headers
  const headers = {
    'Wechatpay-Serial': TEST_CERT_SERIAL,
    'Wechatpay-Timestamp': timestamp,
    'Wechatpay-Nonce': nonce,
    'Wechatpay-Signature': signature,
    'Content-Type': 'application/json',
  }

  return { headers, rawBody: body }
}

// -------------------- 集成测试 --------------------

describe('WechatPayAdapter 集成测试（API v3 官方规范向量）', () => {
  let privateKeyPem: string
  let publicKeyPem: string

  beforeAll(() => {
    const keys = generateRsaKeyPair()
    privateKeyPem = keys.privateKey
    publicKeyPem = keys.publicKey
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 1. RSA-SHA256 签名与验签 --------------------

  describe('RSA-SHA256 签名与验签链路', () => {
    it('buildAuthorization 应生成符合 WECHATPAY2-SHA256-RSA2048 格式的签名', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const auth = adapter.buildAuthorization('POST', '/v3/pay/transactions/jsapi', '{"test":1}')

      // 格式校验
      expect(auth.startsWith('WECHATPAY2-SHA256-RSA2048 ')).toBe(true)
      expect(auth).toContain(`mchid="${TEST_CONFIG.mchId}"`)
      expect(auth).toContain(`serial_no="${TEST_CONFIG.serialNo}"`)
      expect(auth).toMatch(/timestamp="\d+"/)
      expect(auth).toMatch(/nonce_str="[a-f0-9]+"/)
      expect(auth).toMatch(/signature="[A-Za-z0-9+/=]+"/)

      // 签名可验证
      const matchTs = auth.match(/timestamp="(\d+)"/)
      const matchNonce = auth.match(/nonce_str="([^"]+)"/)
      const matchSig = auth.match(/signature="([^"]+)"/)
      expect(matchTs).toBeTruthy()
      expect(matchNonce).toBeTruthy()
      expect(matchSig).toBeTruthy()

      const signContent = `POST\n/v3/pay/transactions/jsapi\n${matchTs![1]}\n${matchNonce![1]}\n{"test":1}\n`
      const isValid = crypto.verify(
        'RSA-SHA256',
        Buffer.from(signContent),
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(matchSig![1], 'base64'),
      )
      expect(isValid).toBe(true)

      adapter.destroy()
    })

    it('buildPaySign 应生成可验证的小程序支付签名', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const timeStamp = '1700000000'
      const nonceStr = 'testnonce123'
      const pkg = 'prepay_id=wx201410272009395522657a690389285100'

      const paySign = adapter.buildPaySign(timeStamp, nonceStr, pkg)

      // 签名串：appId\ntimestamp\nnonceStr\npackage\n
      const signContent = `${TEST_CONFIG.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
      const isValid = crypto.verify(
        'RSA-SHA256',
        Buffer.from(signContent),
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(paySign, 'base64'),
      )
      expect(isValid).toBe(true)

      adapter.destroy()
    })
  })

  // -------------------- 2. AES-256-GCM 加密与解密 --------------------

  describe('AES-256-GCM 加密与解密链路', () => {
    it('应正确解密符合 API v3 规范的 AES-GCM 加密内容', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const plaintext = JSON.stringify({
        appid: TEST_CONFIG.appId,
        mchid: TEST_CONFIG.mchId,
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_integration_001',
        trade_type: 'JSAPI',
        trade_state: 'SUCCESS',
        trade_state_desc: '支付成功',
        success_time: '2025-01-01T00:00:00+08:00',
        amount: { total: 990, payer_total: 990, currency: 'CNY' },
        payer: { openid: 'oTestOpenid' },
      })

      const nonce = crypto.randomBytes(12).toString('hex')
      const associatedData = 'transaction'
      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce, associatedData)

      // 解密
      const decrypted = adapter.decryptResource(ciphertext, associatedData, nonce)
      const parsed = JSON.parse(decrypted)

      expect(parsed.out_trade_no).toBe('RC20250101000000123456')
      expect(parsed.transaction_id).toBe('wx_tx_integration_001')
      expect(parsed.trade_state).toBe('SUCCESS')
      expect(parsed.amount.total).toBe(990)
      expect(parsed.amount.currency).toBe('CNY')

      adapter.destroy()
    })

    it('应正确解密 decryptAndParseResource 返回结构化结果', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const plaintext = JSON.stringify({
        appid: TEST_CONFIG.appId,
        mchid: TEST_CONFIG.mchId,
        out_trade_no: 'RC_TEST_002',
        transaction_id: 'wx_tx_002',
        trade_state: 'SUCCESS',
        amount: { total: 1990, currency: 'CNY' },
      })

      const nonce = crypto.randomBytes(12).toString('hex')
      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce, 'transaction')

      const result = adapter.decryptAndParseResource({
        ciphertext,
        nonce,
        associated_data: 'transaction',
        algorithm: 'AEAD_AES_256_GCM',
      })

      expect(result.appid).toBe(TEST_CONFIG.appId)
      expect(result.mchid).toBe(TEST_CONFIG.mchId)
      expect(result.out_trade_no).toBe('RC_TEST_002')
      expect(result.transaction_id).toBe('wx_tx_002')
      expect(result.amount?.total).toBe(1990)

      adapter.destroy()
    })
  })

  // -------------------- 3. 回调验签完整流程 --------------------

  describe('回调验签完整流程（verifyNotification）', () => {
    it('完整的回调验签 + 解密流程应正确通过', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const decryptedPayload = {
        appid: TEST_CONFIG.appId,
        mchid: TEST_CONFIG.mchId,
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_full_001',
        trade_type: 'JSAPI',
        trade_state: 'SUCCESS',
        amount: { total: 990, payer_total: 990, currency: 'CNY' },
      }

      const { headers, rawBody } = buildCallbackRequest(privateKeyPem, decryptedPayload)

      // 验签
      const notification: WechatPayNotification = await adapter.verifyNotification(headers, rawBody)

      expect(notification.verified).toBe(true)
      expect(notification.body?.event_type).toBe('TRANSACTION.SUCCESS')
      expect(notification.body?.resource?.ciphertext).toBeTruthy()

      // 解密
      const resource = notification.body!.resource!
      const plaintext = adapter.decryptResource(
        resource.ciphertext!,
        resource.associated_data ?? '',
        resource.nonce!,
      )
      const parsed = JSON.parse(plaintext)

      expect(parsed.out_trade_no).toBe('RC20250101000000123456')
      expect(parsed.transaction_id).toBe('wx_tx_full_001')
      expect(parsed.trade_state).toBe('SUCCESS')

      adapter.destroy()
    })

    it('篡改 body 后验签应失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const { headers, rawBody } = buildCallbackRequest(privateKeyPem, {
        out_trade_no: 'RC_TAMPER_001',
        transaction_id: 'wx_tx_tamper',
        trade_state: 'SUCCESS',
      })

      // 篡改 body 中可见的 summary 字段（out_trade_no 在加密密文中，不在 raw body 里）
      const tamperedBody = rawBody.replace('支付成功', '支付失败')

      const notification = await adapter.verifyNotification(headers, tamperedBody)
      expect(notification.verified).toBe(false)

      adapter.destroy()
    })

    it('超时时间戳（>5分钟）应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString()
      const { headers, rawBody } = buildCallbackRequest(
        privateKeyPem,
        {
          out_trade_no: 'RC_EXPIRED_001',
          transaction_id: 'wx_tx_expired',
          trade_state: 'SUCCESS',
        },
        { timestamp: expiredTimestamp },
      )

      const notification = await adapter.verifyNotification(headers, rawBody)
      expect(notification.verified).toBe(false)

      adapter.destroy()
    })

    it('重复 nonce 应验签失败（重放保护）', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const payload = {
        out_trade_no: 'RC_REPLAY_001',
        transaction_id: 'wx_tx_replay',
        trade_state: 'SUCCESS',
      }
      const { headers, rawBody } = buildCallbackRequest(privateKeyPem, payload)

      // 第一次验签通过
      const first = await adapter.verifyNotification(headers, rawBody)
      expect(first.verified).toBe(true)

      // 第二次相同 nonce 应失败
      const second = await adapter.verifyNotification(headers, rawBody)
      expect(second.verified).toBe(false)

      adapter.destroy()
    })
  })

  // -------------------- 4. 字段绑定校验 --------------------

  describe('字段绑定校验（verifyFieldBinding）', () => {
    it('所有字段匹配时应通过', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_bind_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        {
          expectedAppId: TEST_CONFIG.appId,
          expectedMchId: TEST_CONFIG.mchId,
          expectedOrderNo: 'RC20250101000000123456',
          expectedAmountTotal: 990,
          expectedCurrency: 'CNY',
        },
      )

      expect(result.ok).toBe(true)
      expect(result.mismatches).toHaveLength(0)

      adapter.destroy()
    })

    it('appid 不匹配时应失败', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = adapter.verifyFieldBinding(
        {
          appid: 'wx_wrong_appid',
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_bind_002',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        {
          expectedAppId: TEST_CONFIG.appId,
          expectedMchId: TEST_CONFIG.mchId,
          expectedOrderNo: 'RC20250101000000123456',
          expectedAmountTotal: 990,
        },
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('appid'))).toBe(true)

      adapter.destroy()
    })

    it('金额不匹配时应失败', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_bind_003',
          trade_state: 'SUCCESS',
          amount: { total: 100, currency: 'CNY' }, // 100 ≠ 990
        },
        {
          expectedAppId: TEST_CONFIG.appId,
          expectedMchId: TEST_CONFIG.mchId,
          expectedOrderNo: 'RC20250101000000123456',
          expectedAmountTotal: 990,
        },
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('amount.total'))).toBe(true)

      adapter.destroy()
    })

    it('币种不匹配时应失败', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_bind_004',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'USD' }, // USD ≠ CNY
        },
        {
          expectedAppId: TEST_CONFIG.appId,
          expectedMchId: TEST_CONFIG.mchId,
          expectedOrderNo: 'RC20250101000000123456',
          expectedAmountTotal: 990,
          expectedCurrency: 'CNY',
        },
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('currency'))).toBe(true)

      adapter.destroy()
    })
  })

  // -------------------- 5. 生产环境自检 --------------------

  describe('runSelfTest（生产环境 fail-closed 自检）', () => {
    it('自检应通过所有 API v3 规范向量', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      // 自检不应抛错
      await expect(adapter.runSelfTest()).resolves.not.toThrow()

      adapter.destroy()
    })
  })
})
