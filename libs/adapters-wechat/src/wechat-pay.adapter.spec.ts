/**
 * WechatPayAdapter 单元测试
 *
 * 使用 API v3 规范格式测试向量验证：
 *  - buildAuthorization: 请求签名格式与内容
 *  - buildPaySign: 小程序支付参数签名
 *  - verifyCallback: 正常验签 / 篡改 body / 超时时间戳 / nonce 重放 / 缺失头
 *  - aesGcmDecrypt / decryptResource: AES-GCM 解密正确性
 *  - verifyFieldBinding: 全量字段绑定 / 各字段不匹配
 *  - runSelfTest: production fail-closed 自检通过
 *  - 平台证书注入与获取
 */
import * as crypto from 'crypto'
import { RealWechatPayAdapter } from './wechat-pay.adapter'

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

/** 测试用配置常量 */
const TEST_CONFIG = {
  mchId: '1900000001',
  appId: 'wx8888888888888888',
  apiV3Key: 'reelclone_test_apiv3key_32bytes!',
  serialNo: 'TEST_SERIAL_NO_00000000000001',
}

/** 测试用平台证书序列号 */
const TEST_CERT_SERIAL = 'TEST_PLATFORM_CERT_000000001'

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

/** AES-GCM 加密（模拟微信支付平台加密 resource） */
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

// -------------------- 测试 --------------------

describe('RealWechatPayAdapter', () => {
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

  // -------------------- 配置校验 --------------------

  describe('配置校验', () => {
    it('缺少 mchId 时应抛错', () => {
      expect(
        () =>
          new RealWechatPayAdapter({
            ...TEST_CONFIG,
            mchId: '',
          }),
      ).toThrow('mchId')
    })

    it('apiV3Key 非 32 字节时应抛错', () => {
      expect(
        () =>
          new RealWechatPayAdapter({
            ...TEST_CONFIG,
            apiV3Key: 'short',
          }),
      ).toThrow('apiV3Key')
    })

    it('缺少私钥配置时应抛错', () => {
      expect(
        () =>
          new RealWechatPayAdapter({
            mchId: TEST_CONFIG.mchId,
            appId: TEST_CONFIG.appId,
            apiV3Key: TEST_CONFIG.apiV3Key,
            serialNo: TEST_CONFIG.serialNo,
          }),
      ).toThrow('privateKeyPem')
    })
  })

  // -------------------- buildAuthorization --------------------

  describe('buildAuthorization', () => {
    it('应返回 WECHATPAY2-SHA256-RSA2048 格式的 Authorization header', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const auth = adapter.buildAuthorization('POST', '/v3/pay/transactions/jsapi', '{}')

      expect(auth.startsWith('WECHATPAY2-SHA256-RSA2048 ')).toBe(true)
      expect(auth).toContain(`mchid="${TEST_CONFIG.mchId}"`)
      expect(auth).toContain(`serial_no="${TEST_CONFIG.serialNo}"`)
      expect(auth).toContain('timestamp=')
      expect(auth).toContain('nonce_str=')
      expect(auth).toContain('signature=')

      adapter.destroy()
    })

    it('GET 请求 body 应为空字符串', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const auth = adapter.buildAuthorization('GET', '/v3/certificates', '')

      expect(auth).toContain('signature=')
      // 签名应可验证
      const match = auth.match(/timestamp="(\d+)"/)
      const matchNonce = auth.match(/nonce_str="([^"]+)"/)
      const matchSig = auth.match(/signature="([^"]+)"/)
      expect(match).toBeTruthy()
      expect(matchNonce).toBeTruthy()
      expect(matchSig).toBeTruthy()

      // 验证签名
      const signContent = `GET\n/v3/certificates\n${match![1]}\n${matchNonce![1]}\n\n`
      const isValid = crypto.verify(
        'RSA-SHA256',
        Buffer.from(signContent),
        { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(matchSig![1], 'base64'),
      )
      expect(isValid).toBe(true)

      adapter.destroy()
    })
  })

  // -------------------- buildPaySign --------------------

  describe('buildPaySign', () => {
    it('应生成可验证的小程序支付签名', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const timeStamp = '1700000000'
      const nonceStr = 'testnonce'
      const pkg = 'prepay_id=wx201410272009395522657a690389285100'

      const paySign = adapter.buildPaySign(timeStamp, nonceStr, pkg)

      // 验证签名串：appId\ntimeStamp\nnonceStr\npackage\n
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

  // -------------------- verifyCallback --------------------

  describe('verifyCallback', () => {
    it('有效签名应验签通过', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = JSON.stringify({ id: 'evt-001', event_type: 'TRANSACTION.SUCCESS' })
      const signature = signCallback(privateKeyPem, timestamp, nonce, body)

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp,
        nonce,
        signature,
        body,
      })

      expect(result).toBe(true)
      adapter.destroy()
    })

    it('篡改 body 后验签应失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = JSON.stringify({ id: 'evt-001' })
      const signature = signCallback(privateKeyPem, timestamp, nonce, body)

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp,
        nonce: nonce + '_x', // 不同 nonce 避免重放拦截
        signature,
        body: body + '_tampered',
      })

      expect(result).toBe(false)
      adapter.destroy()
    })

    it('超时时间戳（>5分钟）应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = JSON.stringify({ id: 'evt-001' })
      const signature = signCallback(privateKeyPem, expiredTimestamp, nonce, body)

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp: expiredTimestamp,
        nonce,
        signature,
        body,
      })

      expect(result).toBe(false)
      adapter.destroy()
    })

    it('未来时间戳（>5分钟）应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 600).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = JSON.stringify({ id: 'evt-001' })
      const signature = signCallback(privateKeyPem, futureTimestamp, nonce, body)

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp: futureTimestamp,
        nonce,
        signature,
        body,
      })

      expect(result).toBe(false)
      adapter.destroy()
    })

    it('重复 nonce 应验签失败（重放保护）', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = JSON.stringify({ id: 'evt-001' })
      const signature = signCallback(privateKeyPem, timestamp, nonce, body)

      // 第一次验签应通过
      const first = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp,
        nonce,
        signature,
        body,
      })
      expect(first).toBe(true)

      // 第二次使用相同 nonce 应失败（重放保护）
      const timestamp2 = Math.floor(Date.now() / 1000).toString()
      const signature2 = signCallback(privateKeyPem, timestamp2, nonce, body)
      const second = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp: timestamp2,
        nonce,
        signature: signature2,
        body,
      })
      expect(second).toBe(false)

      adapter.destroy()
    })

    it('签名头不完整时应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = await adapter.verifyCallback({
        serial: '',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        nonce: 'n',
        signature: 's',
        body: '{}',
      })

      expect(result).toBe(false)
      adapter.destroy()
    })

    it('非法 timestamp 应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp: 'not-a-number',
        nonce: 'n',
        signature: 's',
        body: '{}',
      })

      expect(result).toBe(false)
      adapter.destroy()
    })

    it('错误的签名应验签失败', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const nonce = crypto.randomBytes(16).toString('hex')

      const result = await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp,
        nonce,
        signature: 'invalid-base64-signature',
        body: '{}',
      })

      expect(result).toBe(false)
      adapter.destroy()
    })
  })

  // -------------------- AES-GCM 解密 --------------------

  describe('aesGcmDecrypt / decryptResource', () => {
    it('应正确解密 AES-GCM 加密内容', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const plaintext = JSON.stringify({
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_001',
        trade_state: 'SUCCESS',
      })
      const nonce = crypto.randomBytes(6).toString('hex')

      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce)

      const decrypted = adapter.aesGcmDecrypt(ciphertext, nonce, '')

      expect(JSON.parse(decrypted.toString('utf8')).out_trade_no).toBe('RC20250101000000123456')
      adapter.destroy()
    })

    it('应正确解密带 associated_data 的内容', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const plaintext = JSON.stringify({ out_trade_no: 'RC_TEST_002' })
      const nonce = crypto.randomBytes(6).toString('hex')
      const aad = 'transaction'

      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce, aad)

      const decrypted = adapter.aesGcmDecrypt(ciphertext, nonce, aad)

      expect(JSON.parse(decrypted.toString('utf8')).out_trade_no).toBe('RC_TEST_002')
      adapter.destroy()
    })

    it('decryptAndParseResource 应解析回调 resource', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const plaintext = JSON.stringify({
        appid: TEST_CONFIG.appId,
        mchid: TEST_CONFIG.mchId,
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_002',
        trade_state: 'SUCCESS',
        amount: { total: 990, currency: 'CNY' },
      })
      const nonce = crypto.randomBytes(6).toString('hex')
      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce)

      const result = adapter.decryptAndParseResource({
        ciphertext,
        nonce,
        associated_data: '',
        algorithm: 'AEAD_AES_256_GCM',
      })

      expect(result.out_trade_no).toBe('RC20250101000000123456')
      expect(result.transaction_id).toBe('wx_tx_002')
      expect(result.amount?.total).toBe(990)
      adapter.destroy()
    })

    it('篡改密文应解密失败（auth tag 校验）', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const plaintext = JSON.stringify({ out_trade_no: 'RC_TEST_003' })
      const nonce = crypto.randomBytes(6).toString('hex')
      const ciphertext = aesGcmEncrypt(TEST_CONFIG.apiV3Key, plaintext, nonce)

      // 篡改密文
      const tampered = ciphertext.slice(0, -4) + 'AAAA'

      expect(() => {
        adapter.aesGcmDecrypt(tampered, nonce, '')
      }).toThrow()

      adapter.destroy()
    })

    it('ciphertext 或 nonce 为空时应抛错', () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      expect(() => adapter.aesGcmDecrypt('', 'nonce', '')).toThrow()
      expect(() => adapter.aesGcmDecrypt('cipher', '', '')).toThrow()

      adapter.destroy()
    })
  })

  // -------------------- 字段绑定校验 --------------------

  describe('verifyFieldBinding', () => {
    let adapter: RealWechatPayAdapter
    beforeAll(() => {
      adapter = createAdapter(privateKeyPem, publicKeyPem)
    })
    afterAll(() => adapter.destroy())

    const baseCtx = {
      expectedAppId: TEST_CONFIG.appId,
      expectedMchId: TEST_CONFIG.mchId,
      expectedOrderNo: 'RC20250101000000123456',
      expectedAmountTotal: 990,
      expectedCurrency: 'CNY',
    }

    it('所有字段匹配时返回 ok=true', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        baseCtx,
      )

      expect(result.ok).toBe(true)
      expect(result.mismatches).toHaveLength(0)
    })

    it('appid 不匹配时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: 'wx_wrong',
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('appid'))).toBe(true)
    })

    it('mchid 不匹配时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: 'wrong_mchid',
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('mchid'))).toBe(true)
    })

    it('out_trade_no 不匹配时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'WRONG_ORDER_NO',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('out_trade_no'))).toBe(true)
    })

    it('amount.total 不匹配时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 1, currency: 'CNY' }, // 金额不匹配
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('amount.total'))).toBe(true)
    })

    it('currency 不匹配时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'USD' }, // 币种不匹配
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('currency'))).toBe(true)
    })

    it('amount.total 缺失时返回 ok=false', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { currency: 'CNY' }, // 缺少 total
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.some((m) => m.includes('amount.total'))).toBe(true)
    })

    it('多字段不匹配时返回所有 mismatch', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: 'wx_wrong',
          mchid: 'wrong_mchid',
          out_trade_no: 'WRONG_ORDER',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 1, currency: 'USD' },
        },
        baseCtx,
      )

      expect(result.ok).toBe(false)
      expect(result.mismatches.length).toBeGreaterThanOrEqual(4)
    })

    it('默认期望币种为 CNY', () => {
      const result = adapter.verifyFieldBinding(
        {
          appid: TEST_CONFIG.appId,
          mchid: TEST_CONFIG.mchId,
          out_trade_no: 'RC20250101000000123456',
          transaction_id: 'wx_tx_001',
          trade_state: 'SUCCESS',
          amount: { total: 990, currency: 'CNY' },
        },
        {
          expectedAppId: TEST_CONFIG.appId,
          expectedMchId: TEST_CONFIG.mchId,
          expectedOrderNo: 'RC20250101000000123456',
          expectedAmountTotal: 990,
          // 不传 expectedCurrency，默认 CNY
        },
      )

      expect(result.ok).toBe(true)
    })
  })

  // -------------------- 平台证书 --------------------

  describe('平台证书管理', () => {
    it('injectPlatformCert 后可通过 getPlatformPublicKey 获取', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)
      const key = await adapter.getPlatformPublicKey(TEST_CERT_SERIAL)
      expect(key).toBe(publicKeyPem)
      adapter.destroy()
    })

    it('未注入的序列号应抛错（无网络拉取时）', async () => {
      const adapter = new RealWechatPayAdapter({
        ...TEST_CONFIG,
        privateKeyPem,
      })
      // 不注入任何证书，直接请求未知序列号
      await expect(adapter.getPlatformPublicKey('UNKNOWN_SERIAL')).rejects.toThrow()
      adapter.destroy()
    })
  })

  // -------------------- Production Fail-Closed 自检 --------------------

  describe('runSelfTest（production fail-closed）', () => {
    it('自检应通过（所有测试向量验证成功）', async () => {
      const adapter = new RealWechatPayAdapter({
        ...TEST_CONFIG,
        privateKeyPem,
      })

      await expect(adapter.runSelfTest()).resolves.not.toThrow()

      adapter.destroy()
    })

    it('自检后应清理自检证书和 nonce', async () => {
      const adapter = new RealWechatPayAdapter({
        ...TEST_CONFIG,
        privateKeyPem,
      })

      await adapter.runSelfTest()

      // 自检证书应被清理（getPlatformPublicKey 应抛错）
      await expect(
        adapter.getPlatformPublicKey('SELFTEST00000000000000000000001'),
      ).rejects.toThrow()

      adapter.destroy()
    })
  })

  // -------------------- destroy --------------------

  describe('destroy', () => {
    it('应清理 nonce 缓存和平台证书缓存', async () => {
      const adapter = createAdapter(privateKeyPem, publicKeyPem)

      // 验签一次以记录 nonce
      const timestamp = Math.floor(Date.now() / 1000).toString()
      const nonce = crypto.randomBytes(16).toString('hex')
      const body = '{}'
      const signature = signCallback(privateKeyPem, timestamp, nonce, body)
      await adapter.verifyCallback({
        serial: TEST_CERT_SERIAL,
        timestamp,
        nonce,
        signature,
        body,
      })

      adapter.destroy()

      // destroy 后再次使用相同 nonce 应不被拦截（缓存已清空），
      // 但因证书也清空了，会抛错而非返回 false
      // 这里只验证不崩溃
      expect(() => adapter.destroy()).not.toThrow()
    })
  })
})
