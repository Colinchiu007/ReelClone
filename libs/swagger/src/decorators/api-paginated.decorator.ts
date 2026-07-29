/**
 * 分页响应 / 包装响应装饰器
 *
 * 与 @reelclone/common 中的 PaginatedResponse / ApiResponse 结构对齐：
 *   { code, message, data: { list, page, pageSize, total }, traceId }
 *
 * Swagger 文档会自动展示分页结构，避免每个分页接口重复手写 @ApiOkResponse。
 */
import { applyDecorators, Type } from '@nestjs/common'
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger'

/**
 * 通用分页数据包装类（用于 Swagger Schema 引用）
 */
class PaginatedDataDto<T> {
  @ApiProperty({ type: Array, description: '当前页数据列表' })
  list: T[]

  @ApiProperty({ example: 1, description: '当前页码，从 1 开始' })
  page: number

  @ApiProperty({ example: 20, description: '每页条数' })
  pageSize: number

  @ApiProperty({ example: 100, description: '总记录数' })
  total: number
}

/**
 * 统一响应包装类（用于 Swagger Schema 引用）
 */
class ApiResponseWrapper<T> {
  @ApiProperty({ example: 0, description: '业务错误码，0 表示成功' })
  code: number

  @ApiProperty({ example: 'success', description: '提示信息' })
  message: string

  @ApiProperty({ description: '业务数据' })
  data: T

  @ApiProperty({
    required: false,
    description: '链路追踪 ID，便于日志关联',
  })
  traceId?: string
}

/**
 * @ApiPaginatedResponse(type)
 *
 * 标注分页接口的成功响应：
 *   { code: 0, message: 'success', data: { list: T[], page, pageSize, total }, traceId }
 *
 * @param type 列表元素的类型（DTO class）
 * @returns 组合装饰器
 *
 * @example
 * ```ts
 * @Get()
 * @ApiPaginatedResponse(AssetDto)
 * @ApiOperation({ summary: '资产列表（分页）' })
 * findAll() { ... }
 * ```
 */
export function ApiPaginatedResponse<T extends Type<unknown>>(
  type: T,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(PaginatedDataDto, type),
    ApiOkResponse({
      description: '分页响应',
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: {
                allOf: [
                  { $ref: getSchemaPath(PaginatedDataDto) },
                  {
                    properties: {
                      list: {
                        type: 'array',
                        items: { $ref: getSchemaPath(type) },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    }),
  )
}

/**
 * @ApiOkResponseWithWrapper(type)
 *
 * 标注普通接口的成功响应，使用统一 ApiResponse 包装：
 *   { code: 0, message: 'success', data: T, traceId }
 *
 * @param type 数据负载类型（DTO class）
 * @returns 组合装饰器
 *
 * @example
 * ```ts
 * @Get(':id')
 * @ApiOkResponseWithWrapper(AssetDto)
 * findOne() { ... }
 * ```
 */
export function ApiOkResponseWithWrapper<T extends Type<unknown>>(
  type: T,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ApiResponseWrapper, type),
    ApiOkResponse({
      description: '统一响应包装',
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseWrapper) },
          {
            properties: {
              data: { $ref: getSchemaPath(type) },
            },
          },
        ],
      },
    }),
  )
}
