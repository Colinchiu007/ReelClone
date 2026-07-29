/**
 * 业务错误码枚举
 *
 * 编码规则：
 *  - 0        ：成功
 *  - 4xx      ：HTTP 标准错误码（对齐 HTTP 状态码）
 *  - 4xxx     ：业务错误码（4 开头表示客户端错误）
 *  - 5xxx     ：服务端错误码（5 开头表示服务端错误）
 */
export enum ErrorCode {
  /** 成功 */
  SUCCESS = 0,

  /** 未授权（未登录或 token 失效） */
  UNAUTHORIZED = 401,

  /** 禁止访问（权限不足） */
  FORBIDDEN = 403,

  /** 资源不存在 */
  NOT_FOUND = 404,

  /** 参数校验错误 */
  VALIDATION_ERROR = 422,

  /** 请求过于频繁，被限流 */
  RATE_LIMITED = 429,

  /** 积分不足 */
  INSUFFICIENT_CREDITS = 4001,

  /** 异步任务执行失败 */
  TASK_FAILED = 4002,

  /** 支付失败 */
  PAYMENT_FAILED = 4003,

  /** 内容合规审查未通过 */
  CONTENT_REJECTED = 4004,

  /** 服务器内部错误 */
  INTERNAL_ERROR = 5000,
}

/**
 * 错误码对应的默认提示信息
 */
export const ErrorCodeMessages: Record<ErrorCode, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.UNAUTHORIZED]: '未授权访问',
  [ErrorCode.FORBIDDEN]: '禁止访问',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.VALIDATION_ERROR]: '参数校验失败',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [ErrorCode.INSUFFICIENT_CREDITS]: '积分不足',
  [ErrorCode.TASK_FAILED]: '任务执行失败',
  [ErrorCode.PAYMENT_FAILED]: '支付失败',
  [ErrorCode.CONTENT_REJECTED]: '内容未通过合规审查',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
}
