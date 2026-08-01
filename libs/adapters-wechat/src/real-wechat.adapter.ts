/**
 * RealWechatAdapter
 *
 * 调用微信小程序 jscode2session 接口：
 *   GET https://api.weixin.qq.com/sns/jscode2session
 *     ?appid=...&secret=...&js_code=...&grant_type=authorization_code
 *
 * 错误处理：
 *  - 微信返回 errcode（非 0）→ BusinessException(UNAUTHORIZED)
 *  - 网络/超时异常 → BusinessException(INTERNAL_ERROR)
 */
import { Logger } from '@nestjs/common'
import axios from 'axios'
import { BusinessException, ErrorCode } from '@reelclone/common'
import type { WechatAdapter, WechatSession } from './wechat-adapter.interface'

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
  return 'errcode' in data && (data as WechatErrorResponse).errcode !== 0
}

export class RealWechatAdapter implements WechatAdapter {
  private readonly logger = new Logger(RealWechatAdapter.name)
  readonly isMock = false

  constructor(
    private readonly appid: string,
    private readonly secret: string,
  ) {}

  async code2session(code: string): Promise<WechatSession> {
    const url = 'https://api.weixin.qq.com/sns/jscode2session'
    const params = {
      appid: this.appid,
      secret: this.secret,
      js_code: code,
      grant_type: 'authorization_code',
    }

    try {
      const resp = await axios.get<WechatSuccessResponse | WechatErrorResponse>(url, {
        params,
        timeout: 5000,
      })
      const data = resp.data

      if (isWechatError(data)) {
        this.logger.error(
          `Wechat code2session failed: errcode=${data.errcode} errmsg=${data.errmsg}`,
        )
        throw new BusinessException(ErrorCode.UNAUTHORIZED, `微信登录失败：${data.errmsg}`, {
          errcode: data.errcode,
        })
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
      const message = err instanceof Error ? err.message : '微信接口调用失败'
      this.logger.error(`Wechat code2session network error: ${message}`)
      throw new BusinessException(
        ErrorCode.INTERNAL_ERROR,
        `微信接口调用失败：${message}`,
        undefined,
      )
    }
  }
}
