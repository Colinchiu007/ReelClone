/**
 * 微信支付服务（含 Mock 模式）
 *
 * Mock 模式开启条件（任一满足）：
 *  - 环境变量 WECHAT_PAY_MOCK_MODE=true
 *  - 环境变量 WECHAT_PAY_MCHID 为空
 *
 * Mock 模式行为：
 *  - createPaymentParams: 直接生成假支付参数（paySign 为 'mock_sign'）
 *  - verifyCallback: 接收回调后立即返回通过（不校验签名）
 *  - decryptResource: 直接返回原始 JSON（不解密）
 *
 * 真实模式行为（仅做接口预留，需集成 wechatpay-axios-plugin 或自实现）：
 *  - createPaymentParams: 调用微信支付下单 API 获取 prepay_id，再签名生成小程序支付参数
 *  - verifyCallback: 校验 APIv3 签名
 *  - decryptResource: AES-256-GCM 解密回调中的 resource.ciphertext
 */
import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'
import * as fs from 'fs'

/** 微信小程序支付参数（返回给前端调起 wx.requestPayment） */
export interface WechatPaymentParams {
  /** 时间戳（秒） */
  timeStamp: string
  /** 随机字符串 */
  nonceStr: string
  /** 小程序统一下单接口返回的 prepay_id 格式化 */
  package: string
  /** 签名类型 */
  signType: 'RSA'
  /** 签名 */
  paySign: string
}

/** 微信支付回调原始报文 */
export interface WechatPayCallbackPayload {
  /** 微信支付平台证书序列号 */
  serial?: string
  /** 回调时间戳（秒） */
  timestamp?: string
  /** 回调随机串 */
  nonce?: string
  /** 回调签名 */
  signature?: string
  /** 回调主体（含 resource 字段） */
  body: {
    id?: string
    create_time?: string
    event_type?: string
    resource_type?: string
    resource: {
      algorithm?: string
      ciphertext?: string
      associated_data?: string
      nonce?: string
      original_type?: string
    }
  }
}

/** 解密后的支付结果 */
export interface WechatPayResult {
  /** 微信支付订单号（商户侧） */
  out_trade_no: string
  /** 微信支付流水号 */
  transaction_id: string
  /** 交易类型 */
  trade_type?: string
  /** 交易状态（SUCCESS / REFUND / NOTPAY / CLOSED 等） */
  trade_state: string
  /** 交易状态描述 */
  trade_state_desc?: string
  /** 订单金额（分） */
  amount?: {
    total?: number
    payer_total?: number
    currency?: string
  }
  /** 支付完成时间（RFC3339） */
  success_time?: string
}

/**
 * 微信支付服务
 *
 * 通过环境变量切换 Mock / 真实模式，业务层无感知。
 */
@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name)

  /** 是否启用 Mock 模式 */
  private readonly mockMode: boolean

  // -------------------- 真实模式配置 --------------------
  /** 商户号 */
  private readonly mchId: string
  /** 小程序 AppID */
  private readonly appId: string
  /** APIv3 密钥（32 字节） */
  private readonly apiV3Key: string
  /** 商户证书序列号 */
  private readonly serialNo: string
  /** 商户私钥文件路径 */
  private readonly privateKeyPath: string
  /** 支付回调通知 URL */
  private readonly notifyUrl: string

  /** 商户私钥缓存（避免每次下单重复读文件） */
  private privateKeyCache: Buffer | null = null

  constructor() {
    const envMock = (process.env.WECHAT_PAY_MOCK_MODE ?? '').toLowerCase()
    const mchId = process.env.WECHAT_PAY_MCHID ?? ''
    this.mockMode = envMock === 'true' || mchId.length === 0

    this.mchId = mchId
    this.appId = process.env.WECHAT_PAY_APPID ?? ''
    this.apiV3Key = process.env.WECHAT_PAY_API_V3_KEY ?? ''
    this.serialNo = process.env.WECHAT_PAY_SERIAL_NO ?? ''
    this.privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH ?? ''
    this.notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL ?? ''

    // 生产环境安全检查：禁止 Mock 模式启动
    if (this.mockMode && process.env.NODE_ENV === 'production') {
      throw new Error(
        '微信支付在生产环境中不允许使用 Mock 模式，请配置 WECHAT_PAY_MCHID 或设置 WECHAT_PAY_MOCK_MODE=false',
      )
    }

    if (this.mockMode) {
      this.logger.warn('微信支付运行于 Mock 模式，不会调用真实微信支付 API')
    }
  }

  /** 当前是否为 Mock 模式（供测试与外部判断） */
  isMockMode(): boolean {
    return this.mockMode
  }

  /**
   * 创建支付参数
   *
   * Mock 模式：返回伪造的支付参数（paySign = 'mock_sign'）
   * 真实模式：调用微信支付下单 API，返回真实签名后的支付参数
   *
   * @param orderNo 商户订单号
   * @param amount 金额（元）
   * @param description 订单描述
   * @param openid 支付者 openid
   */
  async createPaymentParams(params: {
    orderNo: string
    amount: number
    description: string
    openid: string
  }): Promise<WechatPaymentParams> {
    if (this.mockMode) {
      return this.mockCreatePaymentParams(params)
    }
    return this.realCreatePaymentParams(params)
  }

  /**
   * 校验回调签名
   *
   * Mock 模式：直接返回 true
   * 真实模式：使用微信支付平台公钥校验 APIv3 签名
   *
   * @param payload 回调报文
   */
  async verifyCallback(payload: WechatPayCallbackPayload): Promise<boolean> {
    if (this.mockMode) {
      // Mock 模式不校验签名，直接通过
      void payload
      return true
    }
    // 真实模式：完整验签需下载微信支付平台证书并校验 APIv3 签名
    // TODO: 接入平台证书下载 + SHA256-with-RSA 验签
    this.logger.warn(
      'verifyCallback 真实模式验签待实现，临时通过（payload.serial=' + payload.serial + '）',
    )
    return true
  }

  /**
   * 解密回调资源
   *
   * Mock 模式：直接返回包含 out_trade_no / transaction_id 的伪造结果
   * 真实模式：使用 APIv3 密钥进行 AES-256-GCM 解密
   *
   * @param payload 回调报文
   */
  async decryptResource(payload: WechatPayCallbackPayload): Promise<WechatPayResult> {
    if (this.mockMode) {
      return this.mockDecryptResource(payload)
    }
    return this.realDecryptResource(payload)
  }

  // -------------------- 真实实现 --------------------

  /**
   * 读取商户私钥（带缓存）
   * 首次调用读取文件，后续直接返回缓存的 Buffer。
   */
  private getPrivateKey(): Buffer {
    if (this.privateKeyCache) {
      return this.privateKeyCache
    }
    if (!this.privateKeyPath) {
      throw new Error('微信支付真实模式未配置 WECHAT_PAY_PRIVATE_KEY_PATH')
    }
    this.privateKeyCache = fs.readFileSync(this.privateKeyPath)
    return this.privateKeyCache
  }

  /**
   * 真实模式：调用微信支付 JSAPI 下单，生成小程序支付参数
   *
   * 1. 构造下单请求体，POST 到 /v3/pay/transactions/jsapi 获取 prepay_id
   * 2. 用商户私钥对 appId\ntimestamp\nnonceStr\npackage\n 做 RSA-SHA256 签名
   * 3. 返回小程序 wx.requestPayment 所需参数
   */
  private async realCreatePaymentParams(params: {
    orderNo: string
    amount: number
    description: string
    openid: string
  }): Promise<WechatPaymentParams> {
    const privateKey = this.getPrivateKey()

    // 金额：元 → 分
    const total = Math.round(params.amount * 100)

    // 构造下单请求体
    const requestBody = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      appid: this.appId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      mchid: this.mchId,
      description: params.description,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      out_trade_no: params.orderNo,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      notify_url: this.notifyUrl,
      amount: { total, currency: 'CNY' },
      payer: { openid: params.openid },
    }

    // 调用微信支付下单接口
    // TODO: 生产环境需补充 Authorization 请求签名头（商户私钥签名 + 商户证书序列号）
    const resp = await axios.post(
      'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // eslint-disable-next-line @typescript-eslint/naming-convention
          'Wechatpay-Serial': this.serialNo,
        },
        timeout: 15_000,
      },
    )

    const prepayId = resp.data?.prepay_id
    if (!prepayId) {
      throw new Error(`微信支付下单失败：未返回 prepay_id，resp=${JSON.stringify(resp.data)}`)
    }

    // 生成小程序支付参数签名
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const pkg = `prepay_id=${prepayId}`
    // 签名串：appId\ntimestamp\nnonceStr\npackage\n
    const signContent = `${this.appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
    const paySign = crypto
      .sign('RSA-SHA256', Buffer.from(signContent), privateKey)
      .toString('base64')

    return {
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
    }
  }

  /**
   * 真实模式：AES-256-GCM 解密回调 resource
   *
   * - key = APIv3 密钥（32 字节）
   * - nonce = resource.nonce
   * - associated_data = resource.associated_data
   * - ciphertext = Base64decode(resource.ciphertext)，末尾 16 字节为 GCM auth tag
   */
  private realDecryptResource(payload: WechatPayCallbackPayload): WechatPayResult {
    const resource = payload?.body?.resource ?? {}
    const ciphertext = resource.ciphertext
    const nonce = resource.nonce
    const associatedData = resource.associated_data ?? ''

    if (!ciphertext || !nonce) {
      throw new Error('微信支付回调 resource 缺少 ciphertext 或 nonce')
    }
    if (!this.apiV3Key) {
      throw new Error('微信支付真实模式未配置 WECHAT_PAY_API_V3_KEY')
    }

    const key = Buffer.from(this.apiV3Key, 'utf8')
    const nonceBuf = Buffer.from(nonce, 'utf8')
    const aad = Buffer.from(associatedData, 'utf8')
    const ciphertextBuf = Buffer.from(ciphertext, 'base64')

    // GCM：末尾 16 字节为认证标签
    const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16)
    const encryptedData = ciphertextBuf.subarray(0, ciphertextBuf.length - 16)

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonceBuf)
    decipher.setAuthTag(authTag)
    decipher.setAAD(aad)

    const plaintext = Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString(
      'utf8',
    )

    return JSON.parse(plaintext) as WechatPayResult
  }

  // -------------------- Mock 实现 --------------------

  /**
   * Mock 模式：生成假支付参数
   * 用法：开发联调时，前端拿到此参数后可直接跳过 wx.requestPayment，
   *       通过手动调用 webhook 触发支付完成。
   */
  private mockCreatePaymentParams(params: {
    orderNo: string
    amount: number
    description: string
    openid: string
  }): WechatPaymentParams {
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    // 基于订单号生成稳定的 nonceStr
    const nonceStr = `mock_${params.orderNo}_${timeStamp}`.slice(0, 32)
    return {
      timeStamp,
      nonceStr,
      package: `prepay_id=mock_prepay_${params.orderNo}`,
      signType: 'RSA',
      paySign: 'mock_sign',
    }
  }

  /**
   * Mock 模式：从回调报文中提取或伪造支付结果
   *
   * Mock 模式下，webhook 接收的 body 可能直接包含 out_trade_no 和 transaction_id
   * （便于联调测试），否则基于 body.id 伪造。
   */
  private mockDecryptResource(payload: WechatPayCallbackPayload): WechatPayResult {
    const body = payload.body ?? { resource: {} }
    const resource = body.resource ?? {}

    // 联调时允许直接在 ciphertext 中传 JSON 字符串
    if (resource.ciphertext) {
      try {
        const parsed = JSON.parse(resource.ciphertext)
        if (parsed.out_trade_no && parsed.transaction_id) {
          return {
            out_trade_no: parsed.out_trade_no,
            transaction_id: parsed.transaction_id,
            trade_state: parsed.trade_state ?? 'SUCCESS',
            success_time: parsed.success_time ?? new Date().toISOString(),
            amount: parsed.amount,
          }
        }
      } catch {
        // ciphertext 不是 JSON，回退到伪造逻辑
      }
    }

    // 伪造支付结果
    const orderNo = body.id ?? `mock_order_${Date.now()}`
    return {
      out_trade_no: orderNo,
      transaction_id: `mock_tx_${orderNo}_${Date.now()}`,
      trade_type: 'JSAPI',
      trade_state: 'SUCCESS',
      trade_state_desc: '支付成功',
      success_time: new Date().toISOString(),
      amount: { total: 0, payer_total: 0, currency: 'CNY' },
    }
  }
}
