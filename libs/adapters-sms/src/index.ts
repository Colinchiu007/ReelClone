/**
 * @reelclone/adapters-sms — SMS 适配器共享库入口
 *
 * 统一导出 SmsAdapter 契约、Aliyun/Tencent/Mock 实现、运行时 profile 解析与 NestJS 模块。
 * 业务微服务通过 `@reelclone/adapters-sms` 引入 SMS_ADAPTER token，
 * 运行时绑定由 SmsModule 根据 SMS_PROVIDER 环境变量决定，业务代码零分支。
 *
 * SubTask A4.1：契约 + 实现（Aliyun/Tencent/Mock）
 * SubTask A4.2：Mock 隔离 + SMS_PROVIDER 选择 + 动态 Module
 */

// -------------------- 契约 --------------------
export * from './sms.adapter'

// -------------------- profile 解析（fail closed） --------------------
export * from './sms-profile'

// -------------------- 适配器实现 --------------------
export { AliyunSmsAdapter, type AliyunSmsAdapterOptions } from './aliyun-sms.adapter'
export { TencentSmsAdapter, type TencentSmsAdapterOptions } from './tencent-sms.adapter'
export { MockSmsAdapter } from './mock-sms.adapter'

// -------------------- NestJS 模块 --------------------
export { SmsModule, createSmsAdapter } from './sms.module'
