/**
 * 微信适配器契约
 *
 * 定义 WechatAdapter 接口与 WechatSession 类型，供 MockWechatAdapter / RealWechatAdapter 实现。
 * 业务服务通过 DI 注入 WECHAT_ADAPTER token，运行时由 WechatAdapterModule 根据环境绑定具体实现，
 * 业务函数内不再出现 mock/real 分支判断。
 */

/** code2session 返回结构 */
export interface WechatSession {
  /** 用户在当前小程序的 OpenID */
  openid: string
  /** 会话密钥（用于后续解密用户数据，本服务暂不使用） */
  sessionKey: string
  /** 用户在开放平台的 UnionID（仅在满足条件时返回） */
  unionid: string | null
}

/**
 * 微信适配器接口
 *
 * 实现方负责调用微信 code2session（真实）或生成假数据（Mock）。
 * 业务代码只依赖此接口，不感知具体实现。
 */
export interface WechatAdapter {
  /** 是否为 Mock 实现（仅用于可观测性/健康检查，不参与业务分支决策） */
  readonly isMock: boolean
  /** 调用微信 code2session 接口 */
  code2session(code: string): Promise<WechatSession>
}

/** 运行时 profile：test 走 Mock，real 走真实微信接口 */
export type WechatRuntimeProfile = 'test' | 'real'

/** WECHAT_ADAPTER DI token */
export const WECHAT_ADAPTER = 'WECHAT_ADAPTER'
