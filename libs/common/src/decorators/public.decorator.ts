/**
 * @Public() 方法/类装饰器
 *
 * 标记接口为公开访问，JwtAuthGuard 会跳过该接口的鉴权。
 * 适用于登录、注册、健康检查等无需登录的接口。
 *
 * @example
 * ```ts
 * @Public()
 * @Get('health')
 * health() { return { status: 'ok' } }
 * ```
 */
import { SetMetadata } from '@nestjs/common'

/** 标记公开接口的 metadata key */
export const IS_PUBLIC_KEY = 'isPublic'

/**
 * 标记接口为公开访问，跳过 JWT 鉴权守卫
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true)
