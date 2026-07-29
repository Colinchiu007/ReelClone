/**
 * WechatPayService 单元测试
 *
 * 覆盖 Mock 模式下的：
 *  - createPaymentParams: 返回结构、paySign='mock_sign'、package 含 prepay_id
 *  - verifyCallback: 直接返回 true
 *  - decryptResource: ciphertext 为 JSON / 空 ciphertext 伪造 / 不完整 JSON 回退
 *  - isMockMode: 默认为 true
 */
import { WechatPayService } from './wechat-pay.service';

describe('WechatPayService', () => {
  let service: WechatPayService;

  beforeEach(() => {
    // 强制 Mock 模式
    process.env.WECHAT_PAY_MOCK_MODE = 'true';
    process.env.WECHAT_PAY_MCHID = '';
    service = new WechatPayService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------- 模式判定 --------------------

  describe('isMockMode', () => {
    it('WECHAT_PAY_MOCK_MODE=true 时为 Mock 模式', () => {
      expect(service.isMockMode()).toBe(true);
    });

    it('WECHAT_PAY_MCHID 为空时为 Mock 模式', () => {
      process.env.WECHAT_PAY_MOCK_MODE = 'false';
      process.env.WECHAT_PAY_MCHID = '';
      const svc = new WechatPayService();
      expect(svc.isMockMode()).toBe(true);
    });

    it('WECHAT_PAY_MOCK_MODE=false 且 WECHAT_PAY_MCHID 非空时为真实模式', () => {
      process.env.WECHAT_PAY_MOCK_MODE = 'false';
      process.env.WECHAT_PAY_MCHID = '1234567890';
      const svc = new WechatPayService();
      expect(svc.isMockMode()).toBe(false);
    });
  });

  // -------------------- createPaymentParams --------------------

  describe('createPaymentParams (Mock 模式)', () => {
    it('应返回包含 mock_sign 的支付参数', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      });

      expect(params).toHaveProperty('timeStamp');
      expect(params).toHaveProperty('nonceStr');
      expect(params).toHaveProperty('package');
      expect(params).toHaveProperty('signType', 'RSA');
      expect(params).toHaveProperty('paySign', 'mock_sign');
    });

    it('package 字段应包含 prepay_id', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 19.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      });

      expect(params.package).toContain('prepay_id');
      expect(params.package).toContain('RC20250101000000123456');
    });

    it('timeStamp 应为 10 位秒级时间戳', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      });

      expect(params.timeStamp).toMatch(/^\d{10}$/);
    });

    it('nonceStr 应基于订单号生成', async () => {
      const params = await service.createPaymentParams({
        orderNo: 'RC20250101000000123456',
        amount: 9.9,
        description: '测试套餐',
        openid: 'oTestOpenid',
      });

      expect(params.nonceStr).toContain('RC20250101000000123456');
    });
  });

  // -------------------- verifyCallback --------------------

  describe('verifyCallback (Mock 模式)', () => {
    it('应直接返回 true（不校验签名）', async () => {
      const payload = {
        body: {
          id: 'evt_001',
          resource: {
            ciphertext: 'xxx',
            nonce: 'n',
            associated_data: 'ad',
          },
        },
      };
      const result = await service.verifyCallback(payload as never);
      expect(result).toBe(true);
    });

    it('空 payload 时也应返回 true', async () => {
      const result = await service.verifyCallback({ body: { resource: {} } } as never);
      expect(result).toBe(true);
    });
  });

  // -------------------- decryptResource --------------------

  describe('decryptResource (Mock 模式)', () => {
    it('ciphertext 为完整 JSON 时直接解析', async () => {
      const ciphertext = JSON.stringify({
        out_trade_no: 'RC20250101000000123456',
        transaction_id: 'wx_tx_001',
        trade_state: 'SUCCESS',
        success_time: '2025-01-01T00:00:00Z',
        amount: { total: 990, payer_total: 990, currency: 'CNY' },
      });

      const payload = {
        body: {
          id: 'evt_001',
          resource: { ciphertext },
        },
      };

      const result = await service.decryptResource(payload as never);
      expect(result.out_trade_no).toBe('RC20250101000000123456');
      expect(result.transaction_id).toBe('wx_tx_001');
      expect(result.trade_state).toBe('SUCCESS');
      expect(result.amount?.total).toBe(990);
    });

    it('ciphertext 不是 JSON 时回退到伪造逻辑', async () => {
      const payload = {
        body: {
          id: 'RC20250101000000123456',
          resource: { ciphertext: 'not-a-json' },
        },
      };

      const result = await service.decryptResource(payload as never);
      // 应回退到基于 body.id 的伪造
      expect(result.out_trade_no).toBe('RC20250101000000123456');
      expect(result.transaction_id).toContain('RC20250101000000123456');
      expect(result.trade_state).toBe('SUCCESS');
    });

    it('空 ciphertext 时基于 body.id 伪造', async () => {
      const payload = {
        body: {
          id: 'RC20250101000000999999',
          resource: {},
        },
      };

      const result = await service.decryptResource(payload as never);
      expect(result.out_trade_no).toBe('RC20250101000000999999');
      expect(result.transaction_id).toContain('RC20250101000000999999');
      expect(result.trade_state).toBe('SUCCESS');
      expect(result.success_time).toBeDefined();
    });

    it('JSON 缺少 out_trade_no 时回退到伪造', async () => {
      const payload = {
        body: {
          id: 'fallback_order',
          resource: {
            ciphertext: JSON.stringify({ foo: 'bar' }),
          },
        },
      };

      const result = await service.decryptResource(payload as never);
      // 缺少 out_trade_no，回退到 body.id
      expect(result.out_trade_no).toBe('fallback_order');
    });

    it('JSON 缺少 transaction_id 时回退到伪造', async () => {
      const payload = {
        body: {
          id: 'fallback_tx',
          resource: {
            ciphertext: JSON.stringify({ out_trade_no: 'xxx' }),
          },
        },
      };

      const result = await service.decryptResource(payload as never);
      expect(result.out_trade_no).toBe('fallback_tx');
    });

    it('body.id 缺失时使用 mock_order 前缀', async () => {
      const payload = {
        body: {
          resource: {},
        },
      };

      const result = await service.decryptResource(payload as never);
      expect(result.out_trade_no).toContain('mock_order_');
    });
  });
});
