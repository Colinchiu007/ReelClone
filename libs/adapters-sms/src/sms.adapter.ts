/**
 * 短信适配器契约
 *
 * 定义 SmsAdapter 接口与 SmsSendResult 类型，供 AliyunSmsAdapter / TencentSmsAdapter /
 * MockSmsAdapter 实现。业务服务通过 DI 注入 SMS_ADAPTER token，
 * 运行时绑定由 SmsModule 根据 SMS_PROVIDER 环境变量决定，业务代码零分支。
 *
 * 接口签名对齐 tasks.md SubTask A4.1：
 *   sendSms(phone, templateCode, params) → { messageId, status }
 *
 * 业务调用方负责生成验证码并构造 params（如 { code: '123456' }），
 * 适配器只负责调用真实 SMS provider 并返回 messageId（用于状态查询）。
 */

/** 短信发送结果 */
export interface SmsSendResult {
  /** 服务商返回的回执 ID（阿里云 BizId / 腾讯云 SerialNo / Mock 合成值），用于后续状态查询 */
  messageId: string
  /** 发送状态：sent 表示已受理，failed 表示失败（已抛出业务异常的不会到此分支） */
  status: 'sent' | 'failed'
}

/**
 * 短信适配器接口
 *
 * 实现方负责调用真实 SMS provider API（或 Mock 日志输出）。
 * 业务代码只依赖此接口，不感知具体实现，无 if mock/real 分支。
 */
export interface SmsAdapter {
  /**
   * 是否为 Mock 实现
   *
   * 仅用于：
   *  - 控制器决定是否回显 mockCode 给客户端（Mock 模式下需要返回固定码便于联调）
   *  - 可观测性 / 健康检查展示当前绑定的 adapter 类型
   *
   * 不参与业务分支决策（业务代码不写 `if (adapter.isMock)`）。
   */
  readonly isMock: boolean

  /**
   * 发送短信
   *
   * @param phone 接收手机号（中国大陆 11 位）
   * @param templateCode 短信模板 CODE（阿里云 TemplateCode / 腾讯云 TemplateId）
   * @param params 模板参数（如 { code: '123456' }），由调用方按模板变量名构造
   * @returns 发送结果，包含 messageId 与 status
   * @throws BusinessException 当 provider 返回错误或网络异常时（status=failed 不会通过返回值传递）
   */
  sendSms(
    phone: string,
    templateCode: string,
    params: Record<string, string>,
  ): Promise<SmsSendResult>
}

/** SMS_ADAPTER DI token */
export const SMS_ADAPTER = 'SMS_ADAPTER'

/** 支持的 SMS provider 类型（由 SMS_PROVIDER 环境变量选择） */
export type SmsProvider = 'aliyun' | 'tencent'

/** 运行时 profile：test 走 Mock，real 走真实 SMS provider 接口 */
export type SmsRuntimeProfile = 'test' | 'real'
