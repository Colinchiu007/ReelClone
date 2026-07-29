import { SetMetadata } from '@nestjs/common';

/** 标记内部 API 的 metadata key */
export const IS_INTERNAL_API_KEY = 'isInternalApi';

/**
 * @InternalApi() 装饰器
 *
 * 标记接口为内部 API，由 InternalApiKeyGuard 校验 `x-api-key` Header。
 * 配合 @Public() 一起使用以跳过 JWT 鉴权。
 *
 * @example
 * ```ts
 * @Public()
 * @InternalApi()
 * @Post('freeze')
 * freeze(@Body() dto: FreezePointsDto) { ... }
 * ```
 */
export const InternalApi = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_INTERNAL_API_KEY, true);
