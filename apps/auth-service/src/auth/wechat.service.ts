/**
 * 微信小程序 code2session 调用服务（业务侧薄封装）
 *
 * 仅依赖注入的 WechatAdapter 完成真实/Mock 调用，运行时绑定由 WechatAdapterModule
 * 根据 profile 决定（fail closed）。本服务不包含任何 mock/real 分支判断，
 * 业务函数 code2session 只做入参校验后委托 adapter。
 */
import { Inject, Injectable } from '@nestjs/common'
import { BusinessException, ErrorCode } from '@reelclone/common'
import { WECHAT_ADAPTER, type WechatAdapter, type WechatSession } from '@reelclone/adapters-wechat'

// 保留 WechatSession 类型导出，兼容现有 import 路径
export type { WechatSession } from '@reelclone/adapters-wechat'

@Injectable()
export class WechatService {
  constructor(@Inject(WECHAT_ADAPTER) private readonly adapter: WechatAdapter) {}

  /** 是否为 Mock 模式（仅用于可观测性/健康检查，不参与业务分支决策） */
  isMockMode(): boolean {
    return this.adapter.isMock
  }

  /**
   * 调用微信 code2session 接口
   * @param code wx.login() 返回的临时登录凭证
   */
  async code2session(code: string): Promise<WechatSession> {
    if (!code || typeof code !== 'string') {
      throw new BusinessException(ErrorCode.VALIDATION_ERROR, 'wechat code 不能为空')
    }
    return this.adapter.code2session(code)
  }
}
