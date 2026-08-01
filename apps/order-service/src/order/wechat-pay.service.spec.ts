/**
 * WechatPayService 单元测试
 *
 * 覆盖（基于 MockWechatPayAdapter）：
 *  - isMockMode: Mock 适配器时为 true
 *  - createPaymentParams: 返回结构、paySign='mock_sign'、package 含 prepay_id
 *  - verifyAndDecryptCallback: Mock 适配器验签通过 + 解密返回明文 JSON
 */
import { MockWechatPayAdapter } from '@reelclone/adapters-wechat'
import { WechatPayService } from './wechat-pay.service'

describe('WechatPayService', () => {
  let service: WechatPayService
  let adapter: MockWechatPayAdapter

  beforeEach(() => {
    adapter = new MockWechatPayAdapter()
    service = new WechatPayService(adapter)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  // -------------------- 模式判定 --------------------

  describe('isMockMode', () => {
    it('Mock 适配器时返回 true', () => {
      expect(service.isMockMode()).toBe(true)
    })
  })

  // -------------------- createPaymentParams --------------------

  describe('createPaymentParams (Mock 模式)', () => {
    it('应返回包含 mock_sign 的支付参数', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      })

      expect(params).toHaveProperty('timeStamp')
      expect(params).toHaveProperty('nonceStr')
      expect(params).toHaveProperty('package')
      expect(params).toHaveProperty('signType', 'RSA')
      expect(params).toHaveProperty('paySign', 'mock_sign')
    })

    it('package 字段应包含 prepay_id', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 19.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      })

      expect(params.package).toContain('prepay_id')
      expect(params.package).toContain('RC20250101000000123456')
    })

    it('timeStamp 应为 10 位秒级时间戳', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      })

      expect(params.timeStamp).toMatch(/^\d{10}$/)
    })

    it('nonceStr 应基于订单号生成', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      })

      expect(params.nonceStr).toContain('RC20250101000000123456')
    })
  })

  // -------------------- verifyAndDecryptCallback --------------------

  describe('verifyAndDecryptCallback (Mock 模式)', () => {
    it('Mock 适配器验签通过 + 解密返回明文 JSON', async () => {
      // Mock 适配器的 decryptResource 直接返回 ciphertext 原文
      const plaintext = JSON.stringify({
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_001',
        trade_state: 'SUCCESS',
        success_time: '2025-01-01T00:00:00Z',
        amount: { total: 990, payer_total: 990, currency: 'CNY' },
      })

      const rawBody = JSON.stringify({
        id: 'evt_001',
        event_type: 'TRANSACTION.SUCCESS',
        resource: {
          ciphertext: plaintext,
          nonce: 'n',
          associated_data: 'ad',
        },
      })

      const result = await service.verifyAndDecryptCallback({}, rawBody)

      expect(result.verified).toBe(true)
      expect(result.decrypted).not.toBeNull()
      expect(result.decrypted?.out_trade_no).toBe('RC20250101000000123456')
      expect(result.decrypted?.transaction_id).toBe('wx_tx_001')
      expect(result.decrypted?.trade_state).toBe('SUCCESS')
      expect(result.decrypted?.amount?.total).toBe(990)
    })

    it('resource 缺失 ciphertext 时 decrypted 为 null', async () => {
      const rawBody = JSON.stringify({
        id: 'evt_002',
        event_type: 'TRANSACTION.SUCCESS',
        resource: {},
      })

      const result = await service.verifyAndDecryptCallback({}, rawBody)

      expect(result.verified).toBe(true)
      expect(result.decrypted).toBeNull()
    })

    it('解密后非 JSON 时应抛错', async () => {
      const rawBody = JSON.stringify({
        id: 'evt_003',
        resource: {
          ciphertext: 'not-a-json',
          nonce: 'n',
        },
      })

      await expect(service.verifyAndDecryptCallback({}, rawBody)).rejects.toThrow('JSON 解析失败')
    })
  })
})
