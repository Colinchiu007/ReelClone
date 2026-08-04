/**
 * 微信支付适配器契约
 *
 * 定义 IWechatPayAdapter 接口，供 RealWechatPayAdapter / MockWechatPayAdapter 实现。
 * 业务服务通过 DI 注入 WECHAT_PAY_ADAPTER token，运行时由 WechatPayAdapterModule
 * 根据环境绑定具体实现，业务函数内不再出现 mock/real 分支判断。
 *
 * 设计要点：
 *  - verifyNotification 返回验签后的 WechatPayNotification（含原始 body 与解密所需的 resource）
 *  - decryptResource 返回解密后的原始 JSON 字符串（由调用方自行 JSON.parse 并做字段绑定校验）
 *  - isMock 仅用于可观测性/健康检查，不参与业务分支决策
 */

/** 回调验签后返回的通知结构 */
export interface WechatPayNotification {
  /** 是否验签通过 */
  verified: boolean
  /** 微信支付平台证书序列号 */
  serial: string
  /** 回调时间戳（秒） */
  timestamp: string
  /** 回调随机串 */
  nonce: string
  /** 原始 body 字符串（验签用，未修改） */
  rawBody: string
  /** 解析后的 body（若 rawBody 为合法 JSON） */
  body?: {
    id?: string
    create_time?: string
    event_type?: string
    resource_type?: string
    resource?: {
      algorithm?: string
      ciphertext?: string
      associated_data?: string
      nonce?: string
      original_type?: string
    }
    summary?: string
  }
}

/** 分账请求参数 */
export interface ProfitSharingRequest {
  /** 商户订单号（即 out_trade_no） */
  orderNo: string
  /** 微信支付流水号 */
  transactionId: string
  /** 描述 */
  description: string
  /** 分账接收方列表 */
  receivers: Array<{
    /** 接收方类型：OPENID / MERCHANT_ID */
    type: string
    /** 接收方账号 */
    account: string
    /** 分账金额（分） */
    amount: number
    /** 分账结果描述（用于展示） */
    description?: string
  }>
}

/** 分账查询结果 */
export interface ProfitSharingQueryResult {
  /** 商户分账单号 */
  outOrderNo: string
  /** 分账状态：SUCCESS / PROCESSING / FAILED */
  state: string
  /** 分账单号（微信侧） */
  profitSharingNo: string | null
  /** 各接收方结果 */
  receivers: Array<{
    type: string
    account: string
    amount: number
    state: string
    failReason?: string
  }>
}

/**
 * 微信支付适配器接口
 *
 * 实现方负责：
 *  - 真实模式：API v3 请求签名、平台证书轮换、回调验签（时间窗/nonce/replay）、AES-GCM 解密
 *  - Mock 模式：跳过验签直接返回通过，解密直接返回原始内容（仅 test profile）
 *
 * 业务代码只依赖此接口，不感知具体实现。
 */
export interface IWechatPayAdapter {
  /** 是否为 Mock 实现（仅用于可观测性/健康检查，不参与业务分支决策） */
  readonly isMock: boolean

  /**
   * 验证微信支付回调通知
   *
   * 校验项（真实模式，任一失败返回 verified=false）：
   *  1. 时间窗：Wechatpay-Timestamp 与服务器时间差 ≤ ±5 分钟
   *  2. nonce 防重放：同一 nonce 在 TTL 内不可重复使用
   *  3. 签名校验：使用平台证书公钥验证 SHA256-with-RSA 签名
   *
   * @param headers HTTP 请求头（含 Wechatpay-Serial/Timestamp/Nonce/Signature）
   * @param rawBody 原始 body 字符串（必须为未修改的 raw body）
   * @returns 验签结果通知
   */
  verifyNotification(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<WechatPayNotification>

  /**
   * AES-256-GCM 解密回调 resource.ciphertext
   *
   * - key = APIv3 密钥（32 字节 UTF-8）
   * - nonce = resource.nonce
   * - associated_data = resource.associated_data
   * - ciphertext = Base64decode(resource.ciphertext)，末尾 16 字节为 GCM auth tag
   *
   * @param ciphertext Base64 编码的密文（含 auth tag）
   * @param associatedData 关联数据
   * @param nonce nonce 字符串
   * @returns 解密后的明文字符串（JSON）
   */
  decryptResource(ciphertext: string, associatedData: string, nonce: string): string

  /**
   * 构建微信支付 API v3 请求签名 Authorization 头
   *
   * 签名串格式：{METHOD}\n{URL}\n{TIMESTAMP}\n{NONCE_STR}\n{BODY}\n
   * 签名算法：RSA-SHA256（商户私钥）
   * 返回格式：WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",timestamp="...",serial_no="...",signature="..."
   *
   * @param method HTTP 方法（大写，如 GET、POST）
   * @param url 请求路径（不含域名，如 /v3/pay/transactions/jsapi）
   * @param body 请求体字符串（GET 请求传空字符串）
   * @returns 完整的 Authorization 头值
   */
  buildAuthorization(method: string, url: string, body: string): string

  /**
   * 发起分账请求
   *
   * 调用 POST /v3/pay/transactions/profitsharing
   *
   * @param params 分账请求参数
   * @returns 分账请求结果（含商户分账单号）
   */
  initiateProfitSharing(params: ProfitSharingRequest): Promise<{ outOrderNo: string }>

  /**
   * 查询分账状态
   *
   * 调用 GET /v3/pay/transactions/profitsharing/{out_order_no}
   *
   * @param outOrderNo 商户分账单号
   * @returns 分账结果详情
   */
  queryProfitSharing(outOrderNo: string): Promise<ProfitSharingQueryResult>
}

/** WECHAT_PAY_ADAPTER DI token */
export const WECHAT_PAY_ADAPTER = 'WECHAT_PAY_ADAPTER'
