/**
 * @reelclone/adapters-wechat — 微信适配器共享库入口
 *
 * 统一导出 WechatAdapter 契约、Mock/Real 实现、运行时 profile 解析与 NestJS 模块。
 * 业务微服务通过 `@reelclone/adapters-wechat` 引入 WECHAT_ADAPTER token，
 * 运行时绑定由 WechatAdapterModule 根据 profile 决定，业务代码零分支。
 */

// -------------------- 契约 --------------------
export * from './wechat-adapter.interface'
export * from './wechat-pay-adapter.interface'

// -------------------- profile 解析（fail closed） --------------------
export * from './wechat-profile'
export * from './wechat-pay-profile'

// -------------------- 适配器实现（code2session） --------------------
export { MockWechatAdapter } from './mock-wechat.adapter'
export { RealWechatAdapter } from './real-wechat.adapter'

// -------------------- 适配器实现（支付） --------------------
export { MockWechatPayAdapter } from './mock-wechat-pay.adapter'
export { RealWechatPayAdapter } from './wechat-pay.adapter'
export type {
  WechatPayAdapterConfig,
  VerifyCallbackInput,
  DecryptedPaymentResult,
  CallbackResource,
  CallbackBody,
  FieldBindingContext,
  FieldBindingResult,
} from './wechat-pay.adapter'

// -------------------- NestJS 模块 --------------------
export { WechatAdapterModule, createWechatAdapter } from './wechat-adapter.module'
export { WechatPayAdapterModule, createWechatPayAdapter } from './wechat-pay-adapter.module'
