/**
 * 微信支付服务（适配器门面）
 *
 * 职责：
 *  1. 注入 IWechatPayAdapter（由 WechatPayAdapterModule 根据 profile 绑定 Mock/Real）
 *  2. verifyAndDecryptCallback：委托适配器完成验签 + AES-GCM 解密，返回结构化结果
 *  3. createPaymentParams：调用微信支付下单 API 生成小程序支付参数（保留原有 Mock/Real 分支）
 *
 * 设计要点：
 *  - 回调验签/解密完全委托给适配器，业务代码零分支（mock/real 由 profile 决定）
 *  - createPaymentParams 暂保留分支（适配器接口未覆盖下单侧），后续可扩展
 *  - isMockMode() 基于适配器的 isMock 属性，供外部可观测性使用
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'
import * as fs from 'fs'
import {
  type IWechatPayAdapter,
  type WechatPayNotification,
  WECHAT_PAY_ADAPTER,
} from '@reelclone/adapters-wechat'

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
  /** 小程序 AppID */
  appid?: string
  /** 商户号 */
  mchid?: string
}

/** 验签 + 解密的聚合结果 */
export interface VerifyAndDecryptResult {
  /** 是否验签通过 */
  verified: boolean
  /** 适配器返回的通知结构（含原始 body、解析后的 body） */
  notification: WechatPayNotification
  /** 解密后的支付结果（verified=false 或 resource 缺失时为 null） */
  decrypted: WechatPayResult | null
}

/**
 * 微信支付服务
 *
 * 回调验签/解密委托给 IWechatPayAdapter，下单参数生成保留原有实现。
 */
@Injectable()
export class WechatPayService {
  private readonly logger = new Logger(WechatPayService.name)

  /** 商户私钥缓存（createPaymentParams 真实模式用） */
  private privateKeyCache: Buffer | null = null

  constructor(@Inject(WECHAT_PAY_ADAPTER) private readonly adapter: IWechatPayAdapter) {
    if (adapter.isMock) {
      this.logger.warn('微信支付运行于 Mock 适配器模式（test profile）')
    }
  }

  /** 当前是否为 Mock 模式（基于适配器属性） */
  isMockMode(): boolean {
    return this.adapter.isMock
  }

  // -------------------- 回调验签 + 解密 --------------------

  /**
   * 验签并解密微信支付回调
   *
   * 委托 IWechatPayAdapter 完成：
   *  1. verifyNotification：时间窗 / nonce 防重放 / RSA-SHA256 签名校验
   *  2. decryptResource：AES-256-GCM 解密 resource.ciphertext
   *
   * 验签失败时返回 verified=false（不抛错，由调用方决定如何处理）。
   * 解密失败时抛错（验签通过但解密失败属于异常情况，需排查）。
   *
   * @param headers HTTP 请求头（含 Wechatpay-Serial/Timestamp/Nonce/Signature）
   * @param rawBody 原始 body 字符串（必须为未修改的 raw body）
   */
  async verifyAndDecryptCallback(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<VerifyAndDecryptResult> {
    // 1. 委托适配器验签
    const notification = await this.adapter.verifyNotification(headers, rawBody)

    if (!notification.verified) {
      return { verified: false, notification, decrypted: null }
    }

    // 2. 提取 resource 并解密
    const resource = notification.body?.resource
    if (!resource?.ciphertext || !resource?.nonce) {
      // 验签通过但无 resource（可能是非支付类通知），不解密
      this.logger.warn(`回调验签通过但 resource 缺失: eventType=${notification.body?.event_type}`)
      return { verified: true, notification, decrypted: null }
    }

    const plaintext = this.adapter.decryptResource(
      resource.ciphertext,
      resource.associated_data ?? '',
      resource.nonce,
    )

    let decrypted: WechatPayResult
    try {
      decrypted = JSON.parse(plaintext) as WechatPayResult
    } catch (err) {
      throw new Error(`微信支付回调解密后 JSON 解析失败: ${(err as Error).message}`)
    }

    return { verified: true, notification, decrypted }
  }

  // -------------------- 创建支付参数 --------------------

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
    if (this.adapter.isMock) {
      return this.mockCreatePaymentParams(params)
    }
    return this.realCreatePaymentParams(params)
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
    const privateKeyPath = process.env.WECHAT_PAY_PRIVATE_KEY_PATH ?? ''
    if (!privateKeyPath) {
      throw new Error('微信支付真实模式未配置 WECHAT_PAY_PRIVATE_KEY_PATH')
    }
    this.privateKeyCache = fs.readFileSync(privateKeyPath)
    return this.privateKeyCache
  }

  /**
   * 真实模式：调用微信支付 JSAPI 下单，生成小程序支付参数
   *
   * 1. 构造下单请求体，POST 到 /v3/pay/transactions/jsapi 获取 prepay_id
   * 2. 使用 adapter.buildAuthorization() 生成 API v3 请求签名
   * 3. 用商户私钥对 appId\ntimestamp\nnonceStr\npackage\n 做 RSA-SHA256 签名
   * 4. 返回小程序 wx.requestPayment 所需参数
   */
  private async realCreatePaymentParams(params: {
    orderNo: string
    amount: number
    description: string
    openid: string
  }): Promise<WechatPaymentParams> {
    const privateKey = this.getPrivateKey()
    const appId = process.env.WECHAT_PAY_APPID ?? ''
    const mchId = process.env.WECHAT_PAY_MCHID ?? ''
    const serialNo = process.env.WECHAT_PAY_SERIAL_NO ?? ''
    const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL ?? ''

    // 金额：元 → 分
    const total = Math.round(params.amount * 100)

    // 构造下单请求体
    const requestBody = {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      appid: appId,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      mchid: mchId,
      description: params.description,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      out_trade_no: params.orderNo,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      notify_url: notifyUrl,
      amount: { total, currency: 'CNY' },
      payer: { openid: params.openid },
    }

    const bodyStr = JSON.stringify(requestBody)
    const requestUrl = '/v3/pay/transactions/jsapi'

    // 使用 adapter 生成 API v3 请求签名 Authorization 头
    const authorization = this.adapter.buildAuthorization('POST', requestUrl, bodyStr)

    // 调用微信支付下单接口
    const resp = await axios.post(`https://api.mch.weixin.qq.com${requestUrl}`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'Wechatpay-Serial': serialNo,
        Authorization: authorization,
      },
      timeout: 15_000,
    })

    const prepayId = resp.data?.prepay_id
    if (!prepayId) {
      throw new Error(`微信支付下单失败：未返回 prepay_id，resp=${JSON.stringify(resp.data)}`)
    }

    // 生成小程序支付参数签名
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = crypto.randomBytes(16).toString('hex')
    const pkg = `prepay_id=${prepayId}`
    // 签名串：appId\ntimestamp\nnonceStr\npackage\n
    const signContent = `${appId}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
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
}
