/**
 * AliyunSmsAdapter — 阿里云短信（dysmsapi）真实适配器
 *
 * 接入阿里云短信 SendSms 接口（RPC 风格）：
 *   GET https://dysmsapi.aliyuncs.com/
 *     ?Action=SendSms&Version=2017-05-25&Format=JSON
 *     &AccessKeyId=...&SignName=...&TemplateCode=...&PhoneNumbers=...&TemplateParam={"code":"123456"}
 *     &SignatureMethod=HMAC-SHA1&SignatureVersion=1.0&SignatureNonce=...&Timestamp=...&Signature=...
 *
 * 签名算法参考：https://help.aliyun.com/zh/dysmsapi/developer-reference/api-smsservice-send-sms-1
 *  1. 将所有请求参数（不含 Signature）按 key 字典序升序排列
 *  2. 对每个 key/value 做 RFC 3986 percent-encode（+→%20、*→%2A、%7E→~）
 *  3. 拼接 canonical query string：k1=v1&k2=v2&...
 *  4. StringToSign = "GET&%2F&" + percentEncode(canonical query string)
 *  5. Signature = base64(HMAC-SHA1(key = accessKeySecret + "&", message = StringToSign))
 *
 * 错误处理：
 *  - 阿里云返回 Code != "OK" → BusinessException(INTERNAL_ERROR)
 *  - 网络/超时异常 → BusinessException(INTERNAL_ERROR)
 *
 * 设计要点：
 *  - 不引入完整 SDK，手写签名（HMAC-SHA1 + base64）
 *  - 使用 axios（与 adapters-wechat 一致）
 *  - 返回 BizId 作为 messageId，用于后续状态查询
 */
import { Logger } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'
import { BusinessException, ErrorCode } from '@reelclone/common'
import type { SmsAdapter, SmsSendResult } from './sms.adapter'

/** 阿里云短信 API 基础地址 */
const ALIYUN_SMS_ENDPOINT = 'https://dysmsapi.aliyuncs.com'
/** 阿里云短信 API 版本 */
const ALIYUN_SMS_API_VERSION = '2017-05-25'
/** HTTP 超时（毫秒） */
const HTTP_TIMEOUT_MS = 5000

/** 阿里云短信 SendSms 响应 */
interface AliyunSmsResponse {
  /** 业务码，OK 表示成功 */
  Code: string
  /** 描述 */
  Message: string
  /** 请求 ID */
  RequestId: string
  /** 发送回执 ID（成功时返回，用于查询发送状态） */
  BizId?: string
}

/**
 * RFC 3986 percent-encode（阿里云签名专用）
 *
 * encodeURIComponent 基础上：+ → %20、* → %2A、%7E → ~
 */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/\+/g, '%20').replace(/\*/g, '%2A').replace(/%7E/g, '~')
}

/**
 * 计算阿里云 RPC 签名（SignatureVersion 1.0 / HMAC-SHA1）
 *
 * @param params 不含 Signature 的请求参数
 * @param accessKeySecret AccessKeySecret
 * @returns Base64 编码的签名
 */
function computeSignature(params: Record<string, string>, accessKeySecret: string): string {
  const sortedKeys = Object.keys(params).sort()
  const canonicalQuery = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  const stringToSign = `GET&%2F&${percentEncode(canonicalQuery)}`
  return crypto.createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64')
}

/** 生成 ISO 8601 UTC 时间戳（YYYY-MM-DDTHH:mm:ssZ，不含毫秒） */
function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export interface AliyunSmsAdapterOptions {
  /** AccessKeyId */
  accessKeyId: string
  /** AccessKeySecret */
  accessKeySecret: string
  /** 短信签名（如 "ReelClone"） */
  signName: string
  /** 阿里云 API 基础地址（默认官方地址，测试可覆盖） */
  apiBase?: string
}

export class AliyunSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger(AliyunSmsAdapter.name)
  readonly isMock = false
  private readonly accessKeyId: string
  private readonly accessKeySecret: string
  private readonly signName: string
  private readonly apiBase: string

  constructor(options: AliyunSmsAdapterOptions) {
    this.accessKeyId = options.accessKeyId
    this.accessKeySecret = options.accessKeySecret
    this.signName = options.signName
    this.apiBase = options.apiBase ?? ALIYUN_SMS_ENDPOINT
  }

  async sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<SmsSendResult> {
    // 公共参数 + 业务参数（不含 Signature）
    const requestParams: Record<string, string> = {
      Action: 'SendSms',
      Version: ALIYUN_SMS_API_VERSION,
      Format: 'JSON',
      AccessKeyId: this.accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomUUID(),
      Timestamp: formatTimestamp(new Date()),
      PhoneNumbers: phone,
      SignName: this.signName,
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify(params),
    }

    // 计算签名并加入参数
    const signature = computeSignature(requestParams, this.accessKeySecret)
    requestParams.Signature = signature

    // 按字典序拼接最终 URL（所有 value 均已 percent-encode）
    const sortedKeys = Object.keys(requestParams).sort()
    const queryString = sortedKeys
      .map((k) => `${percentEncode(k)}=${percentEncode(requestParams[k])}`)
      .join('&')
    const url = `${this.apiBase}/?${queryString}`

    try {
      const resp = await axios.get<AliyunSmsResponse>(url, {
        timeout: HTTP_TIMEOUT_MS,
      })
      const data = resp.data

      if (!data || data.Code !== 'OK') {
        const errCode = data?.Code ?? 'UNKNOWN'
        const message = data?.Message ?? '未知错误'
        this.logger.error(
          `Aliyun SMS send failed: Code=${errCode}, Message=${message}, phone=${phone}`,
        )
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, `短信发送失败：${message}`, {
          aliyunCode: errCode,
          phone,
        })
      }

      const messageId = data.BizId ?? data.RequestId
      this.logger.log(`Aliyun SMS sent: phone=${phone}, BizId=${messageId}`)

      return { messageId, status: 'sent' }
    } catch (err) {
      // 已是业务异常直接抛出
      if (err instanceof BusinessException) {
        throw err
      }
      // 网络/超时等异常
      const message = err instanceof Error ? err.message : '阿里云短信接口调用失败'
      this.logger.error(`Aliyun SMS network error: ${message}, phone=${phone}`)
      throw new BusinessException(ErrorCode.INTERNAL_ERROR, '短信发送失败：网络异常', {
        phone,
        reason: message,
      })
    }
  }
}
