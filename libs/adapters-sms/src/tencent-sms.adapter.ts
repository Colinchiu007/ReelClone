/**
 * TencentSmsAdapter — 腾讯云短信（sms.tencentcloudapi.com）真实适配器
 *
 * 接入腾讯云短信 SendSms 接口（TC3 RPC 风格，POST JSON）：
 *   POST https://sms.tencentcloudapi.com/
 *   Headers:
 *     Content-Type: application/json; charset=utf-8
 *     Authorization: TC3-HMAC-SHA256 Credential=...
 *     X-TC-Action: SendSms
 *     X-TC-Version: 2021-01-11
 *     X-TC-Timestamp: ...
 *     X-TC-Region: ap-guangzhou
 *   Body: { PhoneNumberSet, SmsSdkAppId, SignName, TemplateId, TemplateParamSet }
 *
 * 签名算法（TC3-HMAC-SHA256，参考腾讯云签名 v3）：
 *  1. CanonicalRequest = POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:sms.tencentcloudapi.com\n
 *                        x-tc-action:sendsms\n\ncontent-type;host;x-tc-action\n hashedRequestPayload
 *  2. CredentialScope  = {Date}/{Service}/tc3_request  （Date=UTC YYYY-MM-DD, Service=sms）
 *  3. StringToSign     = TC3-HMAC-SHA256\n{Timestamp}\n{CredentialScope}\n{HashedCanonicalRequest}
 *  4. SecretDate       = HMAC-SHA256("TC3" + SecretKey, Date)
 *  5. SecretService    = HMAC-SHA256(SecretDate, Service)
 *  6. SecretSigning    = HMAC-SHA256(SecretService, "tc3_request")
 *  7. Signature        = HexEncode(HMAC-SHA256(SecretSigning, StringToSign))
 *  8. Authorization    = TC3-HMAC-SHA256 Credential={SecretId}/{CredentialScope},
 *                        SignedHeaders=content-type;host;x-tc-action, Signature={Signature}
 *
 * 错误处理：
 *  - 腾讯云返回 Response.Error 非 null → BusinessException(INTERNAL_ERROR)
 *  - 网络/超时异常 → BusinessException(INTERNAL_ERROR)
 *
 * 设计要点：
 *  - 不引入完整 SDK，手写 TC3-HMAC-SHA256 签名
 *  - 使用 axios（与 adapters-wechat 一致）
 *  - 返回 SerialNo 作为 messageId，用于后续状态查询
 */
import { Logger } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'
import { BusinessException, ErrorCode } from '@reelclone/common'
import type { SmsAdapter, SmsSendResult } from './sms.adapter'

/** 腾讯云短信 API 基础地址 */
const TENCENT_SMS_ENDPOINT = 'sms.tencentcloudapi.com'
/** 腾讯云短信 API 版本 */
const TENCENT_SMS_API_VERSION = '2021-01-11'
/** 腾讯云短信服务名（用于签名 CredentialScope） */
const TENCENT_SMS_SERVICE = 'sms'
/** HTTP 超时（毫秒） */
const HTTP_TIMEOUT_MS = 5000

/** 腾讯云 API 通用响应包装 */
interface TencentResponse<T> {
  Response: T
}

/** 腾讯云 SendSms 响应 */
interface TencentSendSmsResponse {
  /** 错误信息（成功时为 null/undefined） */
  Error?: { Code: string; Message: string } | null
  /** 请求 ID */
  RequestId: string
  /** 发送状态集合 */
  SendStatusSet?: Array<{
    /** 序列号，用于查询发送状态 */
    SerialNo: string
    /** 平台错误码，"Ok" 表示成功 */
    Code: string
    /** 错误消息 */
    Message: string
    /** 手机号 */
    PhoneNumber: string
  }>
}

/** SHA256 hex 摘要 */
function sha256Hex(message: string): string {
  return crypto.createHash('sha256').update(message).digest('hex')
}

/** HMAC-SHA256（返回 Buffer） */
function hmacSha256(key: Buffer | string, message: string): Buffer {
  return crypto.createHmac('sha256', key).update(message).digest()
}

/**
 * 计算腾讯云 TC3-HMAC-SHA256 签名
 *
 * @param payload JSON 请求体
 * @param secretId SecretId
 * @param secretKey SecretKey
 * @param timestamp Unix 秒时间戳
 * @param service 服务名（sms）
 * @param host 接入域名
 * @param action API Action（SendSms）
 * @returns Authorization header 值
 */
function buildAuthorization(
  payload: string,
  secretId: string,
  secretKey: string,
  timestamp: number,
  service: string,
  host: string,
  action: string,
): string {
  const date = new Date(timestamp * 1000)
  const dateStr = date.toISOString().slice(0, 10) // YYYY-MM-DD（UTC）

  // Step 1: CanonicalRequest
  const hashedPayload = sha256Hex(payload)
  const canonicalHeaders =
    `content-type:application/json; charset=utf-8\n` +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

  // Step 2: CredentialScope
  const credentialScope = `${dateStr}/${service}/tc3_request`

  // Step 3: StringToSign
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

  // Step 4-6: 派生签名密钥
  const secretDate = hmacSha256(`TC3${secretKey}`, dateStr)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')

  // Step 7: Signature
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  // Step 8: Authorization
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

export interface TencentSmsAdapterOptions {
  /** 腾讯云 SecretId */
  secretId: string
  /** 腾讯云 SecretKey */
  secretKey: string
  /** 短信应用 SdkAppId */
  sdkAppId: string
  /** 短信签名 */
  signName: string
  /** 地域（默认 ap-guangzhou） */
  region?: string
  /** 接入域名（默认官方地址，测试可覆盖） */
  endpoint?: string
}

export class TencentSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(TencentSmsAdapter.name)
  readonly isMock = false
  private readonly secretId: string
  private readonly secretKey: string
  private readonly sdkAppId: string
  private readonly signName: string
  private readonly region: string
  private readonly endpoint: string

  constructor(options: TencentSmsAdapterOptions) {
    this.secretId = options.secretId
    this.secretKey = options.secretKey
    this.sdkAppId = options.sdkAppId
    this.signName = options.signName
    this.region = options.region ?? 'ap-guangzhou'
    this.endpoint = options.endpoint ?? TENCENT_SMS_ENDPOINT
  }

  async sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<SmsSendResult> {
    // 腾讯云要求手机号带国家区号（中国大陆 +86）
    const phoneNumber = phone.startsWith('+') ? phone : `+86${phone}`
    // 模板参数按声明顺序转为数组
    const templateParamSet = Object.values(params)

    const payloadObj = {
      PhoneNumberSet: [phoneNumber],
      SmsSdkAppId: this.sdkAppId,
      SignName: this.signName,
      TemplateId: templateCode,
      TemplateParamSet: templateParamSet,
    }
    const payload = JSON.stringify(payloadObj)

    const timestamp = Math.floor(Date.now() / 1000)
    const authorization = buildAuthorization(
      payload,
      this.secretId,
      this.secretKey,
      timestamp,
      TENCENT_SMS_SERVICE,
      this.endpoint,
      'SendSms',
    )

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: authorization,
      Host: this.endpoint,
      'X-TC-Action': 'SendSms',
      'X-TC-Version': TENCENT_SMS_API_VERSION,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': this.region,
    }

    const url = `https://${this.endpoint}/`

    try {
      const resp = await axios.post<TencentResponse<TencentSendSmsResponse>>(url, payload, {
        headers,
        timeout: HTTP_TIMEOUT_MS,
      })
      const data = resp.data?.Response

      if (!data) {
        this.logger.error(`Tencent SMS empty response: phone=${phone}`)
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, '短信发送失败：服务商响应异常', {
          phone,
        })
      }

      // API 层错误
      if (data.Error) {
        const errCode = data.Error.Code ?? 'UNKNOWN'
        const message = data.Error.Message ?? '未知错误'
        this.logger.error(
          `Tencent SMS send failed: Code=${errCode}, Message=${message}, phone=${phone}`,
        )
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, `短信发送失败：${message}`, {
          tencentCode: errCode,
          phone,
        })
      }

      // 单条发送结果校验（SendStatusSet 第一项即本次发送）
      const status = data.SendStatusSet?.[0]
      if (!status || status.Code !== 'Ok') {
        const errCode = status?.Code ?? 'UNKNOWN'
        const message = status?.Message ?? '未知错误'
        this.logger.error(
          `Tencent SMS send status failed: Code=${errCode}, Message=${message}, phone=${phone}`,
        )
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, `短信发送失败：${message}`, {
          tencentCode: errCode,
          phone,
        })
      }

      const messageId = status.SerialNo || data.RequestId
      this.logger.log(`Tencent SMS sent: phone=${phone}, SerialNo=${messageId}`)

      return { messageId, status: 'sent' }
    } catch (err) {
      // 已是业务异常直接抛出
      if (err instanceof BusinessException) {
        throw err
      }
      // 网络/超时等异常
      const message = err instanceof Error ? err.message : '腾讯云短信接口调用失败'
      this.logger.error(`Tencent SMS network error: ${message}, phone=${phone}`)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '短信发送失败：网络异常', {
        phone,
        reason: message,
      })
    }
  }
}
