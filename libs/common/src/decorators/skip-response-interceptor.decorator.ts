/**
 * @SkipResponseInterceptor() 方法/类装饰器
 *
 * 标记接口跳过全局 ResponseInterceptor 的响应包装。
 * 适用于微信支付回调等需要返回原始格式响应的端点
 * （微信要求回调返回 {"code":"SUCCESS","message":"OK"}，不能被包装为 ApiResponse）。
 *
 * @example
 * ```ts
 * @SkipResponseInterceptor()
 * @Post()
 * async handle() {
 *   return { code: 'SUCCESS', message: 'OK' }
 * }
 * ```
 */
import { SetMetadata } from '@nestjs/common'

/** 标记跳过 ResponseInterceptor 的 metadata key */
export const SKIP_RESPONSE_INTERCEPTOR_KEY = 'skipResponseInterceptor'

/**
 * 标记接口跳过全局 ResponseInterceptor 响应包装
 */
export const SkipResponseInterceptor = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RESPONSE_INTERCEPTOR_KEY, true)
