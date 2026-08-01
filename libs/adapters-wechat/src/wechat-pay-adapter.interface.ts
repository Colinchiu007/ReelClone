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
}

/** WECHAT_PAY_ADAPTER DI token */
export const WECHAT_PAY_ADAPTER = 'WECHAT_PAY_ADAPTER'
