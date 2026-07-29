/**
 * 统一 API 响应格式定义
 */

/**
 * 统一响应结构
 * 所有接口返回均遵循此格式：{ code, message, data, traceId }
 */
export interface ApiResponse<T = unknown> {
  /** 业务错误码，0 表示成功 */
  code: number
  /** 提示信息 */
  message: string
  /** 业务数据 */
  data: T
  /** 链路追踪 ID，便于日志关联 */
  traceId?: string
}

/**
 * 分页响应结构
 */
export interface PaginatedResponse<T = unknown> {
  /** 业务错误码，0 表示成功 */
  code: number
  /** 提示信息 */
  message: string
  /** 分页数据 */
  data: {
    /** 当前页数据列表 */
    list: T[]
    /** 当前页码，从 1 开始 */
    page: number
    /** 每页条数 */
    pageSize: number
    /** 总记录数 */
    total: number
  }
  /** 链路追踪 ID */
  traceId?: string
}

/**
 * 分页查询参数 DTO
 * 配合 class-validator 使用时可添加校验装饰器
 */
export class PaginationDto {
  /** 页码，默认 1 */
  page = 1

  /** 每页条数，默认 20 */
  pageSize = 20
}
