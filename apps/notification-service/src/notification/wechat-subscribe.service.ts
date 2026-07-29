/**
 * 微信小程序订阅消息服务
 *
 * 触发场景：
 *  - 任务完成 / 失败 → 给用户推送订阅消息（用户离线时的兜底通知）
 *  - 由 NotificationService 或 EventSubscriber 在写完 Notification 后调用
 *
 * Mock 模式：
 *  - 触发条件：WECHAT_SUBSCRIBE_MOCK_MODE=true 或 WECHAT_APPID 为空
 *  - 行为：仅打印日志，不调用微信 API
 *
 * 真实模式：
 *  - 第一步：用 WECHAT_APPID + WECHAT_SECRET 换 access_token
 *            GET https://api.weixin.qq.com/cgi-bin/token
 *  - 第二步：调用订阅消息下发接口
 *            POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send
 *
 * access_token 缓存：
 *  - 默认 7200s 有效期，提前 300s 失效
 *  - 进程级缓存（单实例够用），多实例可后续切 Redis
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** 订阅消息入参 */
export interface SendSubscribeMessageInput {
  /** 接收者 openid */
  openid: string
  /** 模板 ID（小程序后台配置） */
  templateId: string
  /** 模板参数，key 为 .DATA 前的字段名 */
  data: Record<string, { value: string }>
  /** 跳转小程序页面（默认首页） */
  page?: string
  /** 跳转小程序类型：developer / trial / formal */
  miniprogramState?: 'developer' | 'trial' | 'formal'
  /** 模板内容语言 */
  lang?: 'zh_CN' | 'en_US' | 'zh_HK' | 'zh_TW'
}

/** 微信 API 返回的 access_token */
interface WechatAccessTokenResponse {
  access_token?: string
  expires_in?: number
  errcode?: number
  errmsg?: string
}

/** 微信 API 返回的订阅消息下发结果 */
interface WechatSubscribeSendResponse {
  errcode?: number
  errmsg?: string
}

/** 微信 token 缓存项 */
interface CachedToken {
  token: string
  /** 绝对过期时间戳（ms），提前 300s 失效 */
  expiresAt: number
}

/** 微信小程序 access_token 接口 */
const WX_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
/** 微信小程序订阅消息下发接口 */
const WX_SUBSCRIBE_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send'

@Injectable()
export class WechatSubscribeService {
  private readonly logger = new Logger(WechatSubscribeService.name)

  /** 缓存的 access_token */
  private cachedToken: CachedToken | null = null

  /** 提前过期时间（ms） */
  private readonly tokenSkewMs = 300_000

  constructor(private readonly config: ConfigService) {}

  /**
   * 是否走 Mock 模式
   * - WECHAT_SUBSCRIBE_MOCK_MODE=true → Mock
   * - WECHAT_APPID 为空 → Mock
   */
  isMockMode(): boolean {
    const explicit = this.config.get<string>('WECHAT_SUBSCRIBE_MOCK_MODE')
    if (explicit === 'true') return true
    if (explicit === 'false') return false
    const appid = this.config.get<string>('WECHAT_APPID') ?? ''
    return appid.trim().length === 0
  }

  /**
   * 发送订阅消息
   * Mock 模式：仅日志
   * 真实模式：换取 access_token → 调用 subscribe/send
   *
   * @returns 是否发送成功（Mock 模式始终返回 true）
   */
  async send(input: SendSubscribeMessageInput): Promise<boolean> {
    if (this.isMockMode()) {
      this.logger.log(
        `[Mock] 订阅消息 → openid=${input.openid} templateId=${input.templateId} data=${JSON.stringify(input.data)} page=${input.page ?? '/'}`,
      )
      return true
    }

    try {
      const accessToken = await this.getAccessToken()
      if (!accessToken) {
        this.logger.error('获取 access_token 失败，订阅消息未发送')
        return false
      }

      const url = `${WX_SUBSCRIBE_URL}?access_token=${accessToken}`
      const body = {
        touser: input.openid,
        template_id: input.templateId,
        page: input.page ?? 'pages/index/index',
        miniprogram_state: input.miniprogramState ?? 'formal',
        lang: input.lang ?? 'zh_CN',
        data: input.data,
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await resp.json()) as WechatSubscribeSendResponse

      if (json.errcode && json.errcode !== 0) {
        this.logger.error(
          `订阅消息发送失败 openid=${input.openid} errcode=${json.errcode} errmsg=${json.errmsg ?? ''}`,
        )
        return false
      }

      this.logger.log(
        `订阅消息发送成功 openid=${input.openid} templateId=${input.templateId}`,
      )
      return true
    } catch (err) {
      this.logger.error(
        `订阅消息发送异常 openid=${input.openid}: ${(err as Error).message}`,
      )
      return false
    }
  }

  /**
   * 获取 access_token（带缓存）
   * 缓存有效期内直接返回，否则重新申请
   */
  private async getAccessToken(): Promise<string | null> {
    const now = Date.now()
    if (this.cachedToken && this.cachedToken.expiresAt > now) {
      return this.cachedToken.token
    }

    const appid = this.config.get<string>('WECHAT_APPID') ?? ''
    const secret = this.config.get<string>('WECHAT_SECRET') ?? ''
    if (!appid || !secret) {
      this.logger.error('WECHAT_APPID 或 WECHAT_SECRET 未配置')
      return null
    }

    const url = `${WX_TOKEN_URL}?grant_type=client_credential&appid=${appid}&secret=${secret}`
    const resp = await fetch(url)
    const json = (await resp.json()) as WechatAccessTokenResponse

    if (!json.access_token) {
      this.logger.error(
        `获取 access_token 失败 errcode=${json.errcode} errmsg=${json.errmsg ?? ''}`,
      )
      return null
    }

    const expiresIn = json.expires_in ?? 7200
    this.cachedToken = {
      token: json.access_token,
      expiresAt: now + expiresIn * 1000 - this.tokenSkewMs,
    }
    this.logger.log(
      `access_token 已刷新，有效期 ${expiresIn}s（缓存提前 ${this.tokenSkewMs / 1000}s 失效）`,
    )
    return this.cachedToken.token
  }
}
