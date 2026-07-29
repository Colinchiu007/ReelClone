/**
 * @CurrentUser() 参数装饰器
 *
 * 从 request.user 中提取当前登录用户信息。
 * 需配合 JwtAuthGuard 使用，守卫验证 token 后会将 payload 注入 request.user。
 *
 * @example
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: CurrentUserPayload) {
 *   return user
 * }
 *
 * @Get('id')
 * getUserId(@CurrentUser('userId') userId: string) {
 *   return userId
 * }
 * ```
 */
import { type ExecutionContext, createParamDecorator } from '@nestjs/common'

/**
 * JWT payload 中携带的用户信息
 * 可按需扩展字段
 */
export interface CurrentUserPayload {
  /** 用户 ID */
  userId: string
  /** 微信 openid */
  openid?: string
  /** 手机号（已绑定用户） */
  phone?: string
  /** 用户角色 */
  role?: string
  /** 额外扩展字段 */
  [key: string]: unknown
}

/**
 * @CurrentUser() 参数装饰器
 *
 * @param data 指定提取的字段名，不传则返回完整 user 对象
 */
export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user?: CurrentUserPayload }>()
    const user = request.user
    if (!user) {
      return undefined
    }
    return data ? user[data] : user
  },
)
