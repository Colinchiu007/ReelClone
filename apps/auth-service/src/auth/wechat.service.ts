/**
 * 微信小程序 code2session 调用服务
 *
 * 真实模式：调用 https://api.weixin.qq.com/sns/jscode2session
 * Mock 模式：WECHAT_APPID 为空 或 WECHAT_MOCK_MODE=true 时启用，
 *           生成假 openid（mock_openid_${hash(code)}），便于本地无凭证测试。
 */
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { createHash } from 'crypto'
import { BusinessException, ErrorCode } from '@reelclone/common'

/** code2session 返回结构 */
export interface WechatSession {
  /** 用户在当前小程序的 OpenID */
  openid: string
  /** 会话密钥（用于后续解密用户数据，本服务暂不使用） */
  sessionKey: string
  /** 用户在开放平台的 UnionID（仅在满足条件时返回） */
  unionid: string | null
}

/** 微信接口错误响应 */
interface WechatErrorResponse {
  errcode: number
  errmsg: string
}

/** 微信接口成功响应 */
interface WechatSuccessResponse {
  openid: string
  session_key: string
  unionid?: string
}

/** 类型守卫：是否为微信错误响应 */
function isWechatError(
  data: WechatSuccessResponse | WechatErrorResponse,
): data is WechatErrorResponse {
  return (
    'errcode' in data && (data as WechatErrorResponse).errcode !== 0
  )
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name)
  private readonly appid: string
  private readonly secret: string
  private readonly mockMode: boolean

  constructor(private readonly configService: ConfigService) {
    this.appid = this.configService.get<string>('wechat.appid', '') ?? ''
    this.secret = this.configService.get<string>('wechat.secret', '') ?? ''
    const mockFlag =
      process.env.WECHAT_MOCK_MODE === 'true' ||
      process.env.WECHAT_MOCK_MODE === '1'
    this.mockMode = mockFlag || !this.appid || !this.secret

    if (this.mockMode) {
      this.logger.warn(
        '⚠️ WechatService running in MOCK mode. Set WECHAT_APPID/WECHAT_SECRET and WECHAT_MOCK_MODE=false to enable real calls.',
      )
    }
  }

  /** 是否为 Mock 模式 */
  isMockMode(): boolean {
    return this.mockMode
  }

  /**
   * 调用微信 code2session 接口
   * @param code wx.login() 返回的临时登录凭证
   */
  async code2session(code: string): Promise<WechatSession> {
    if (!code || typeof code !== 'string') {
      throw new BusinessException(
        ErrorCode.VALIDATION_ERROR,
        'wechat code 不能为空',
      )
    }

    if (this.mockMode) {
      return this.mockCode2session(code)
    }
    return this.realCode2session(code)
  }

  /**
   * Mock 模式：基于 code 生成稳定的假 openid
   * 同一个 code 总是返回同一个 openid，便于联调
   */
  private async mockCode2session(code: string): Promise<WechatSession> {
    const hash = createHash('sha256').update(code).digest('hex').slice(0, 16)
    return {
      openid: `mock_openid_${hash}`,
      sessionKey: `mock_session_key_${hash}`,
      unionid: null,
    }
  }

  /**
   * 真实调用微信接口
   */
  private async realCode2session(code: string): Promise<WechatSession> {
    const url = 'https://api.weixin.qq.com/sns/jscode2session'
    const params = {
      appid: this.appid,
      secret: this.secret,
      js_code: code,
      grant_type: 'authorization_code',
    }

    try {
      const resp = await axios.get<WechatSuccessResponse | WechatErrorResponse>(
        url,
        { params, timeout: 5000 },
      )
      const data = resp.data

      // 微信接口错误：返回 errcode 字段
      if (isWechatError(data)) {
        this.logger.error(
          `Wechat code2session failed: errcode=${data.errcode} errmsg=${data.errmsg}`,
        )
        throw new BusinessException(
          ErrorCode.UNAUTHORIZED,
          `微信登录失败：${data.errmsg}`,
          { errcode: data.errcode },
        )
      }

      return {
        openid: data.openid,
        sessionKey: data.session_key,
        unionid: data.unionid ?? null,
      }
    } catch (err) {
      // 已是业务异常直接抛出
      if (err instanceof BusinessException) {
        throw err
      }
      // 网络/超时等异常
      const message =
        err instanceof Error ? err.message : '微信接口调用失败'
      this.logger.error(`Wechat code2session network error: ${message}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        `微信接口调用失败：${message}`,
        undefined,
      )
    }
  }
}
