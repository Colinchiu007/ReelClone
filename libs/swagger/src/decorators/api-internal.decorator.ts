/**
 * 内部 API 装饰器（Swagger 文档标注版）
 *
 * 与 billing-service 中的 InternalApi 装饰器语义对齐：
 *   - 标记接口为内部 API（仅微服务间调用，不对外公开）
 *   - 通过 x-api-key Header 鉴权（InternalApiKeyGuard）
 *
 * 此装饰器仅作用于 Swagger 文档层面（添加描述与 Security），
 * 实际鉴权由 InternalApiKeyGuard 完成。
 *
 * 注意：使用时仍需配合 @Public() 跳过 JWT 守卫，与既有代码保持一致：
 *
 * ```ts
 * @Public()
 * @ApiInternal()
 * @Post('freeze')
 * freeze(@Body() dto: FreezePointsDto) { ... }
 * ```
 */
import { applyDecorators } from '@nestjs/common'
import { ApiExtension, ApiOperation } from '@nestjs/swagger'

/** 内部 API 的 x-api-key 鉴权方案名 */
export const INTERNAL_API_KEY_SCHEME = 'InternalApiKey'

/**
 * @ApiInternal()
 *
 * 标注接口为内部 API：
 *  - 在 OpenAPI 中通过 x-internal: true 标记
 *  - 在接口摘要后追加「[内部 API]」前缀，便于在 Swagger UI 中识别
 *  - 描述说明该接口需要 x-api-key Header 鉴权
 *
 * @param description 可选的额外描述
 * @returns 组合装饰器
 *
 * @example
 * ```ts
 * @Public()
 * @ApiInternal('冻结积分，由 workbench-service 调用')
 * @Post('freeze')
 * freeze(@Body() dto: FreezePointsDto) { ... }
 * ```
 */
export function ApiInternal(description?: string): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({
      summary: description ? `[内部 API] ${description}` : '[内部 API]',
      description: [
        '**内部 API**：仅微服务间调用，不对小程序公开。',
        '',
        '鉴权方式：在请求头中携带 `x-api-key: <INTERNAL_API_KEY>`，由 InternalApiKeyGuard 校验。',
        '',
        description ?? '',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
    ApiExtension('x-internal', true),
  )
}
