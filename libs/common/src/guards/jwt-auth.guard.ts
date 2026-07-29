/**
 * JWT 鉴权守卫
 *
 * 基于 Passport JWT Strategy 验证 Bearer Token。
 * 支持 @Public() 装饰器标记的公开接口跳过鉴权。
 *
 * 使用方式：
 * 1. 在应用模块中注册 JwtModule 和 PassportModule（strategy: 'jwt'）
 * 2. 实现 JwtStrategy（继承 PassportStrategy，name = 'jwt'）
 * 3. 全局注册：app.useGlobalGuards(app.get(JwtAuthGuard))
 * 4. 公开接口加 @Public() 装饰器
 */
import { type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { BusinessException } from '../exceptions/business.exception'
import { ErrorCode } from '../enums/error-code.enum'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super()
  }

  /**
   * 鉴权入口：先判断是否为公开接口，再交由 Passport JWT 策略验证
   */
  canActivate(context: ExecutionContext) {
    // 检查是否标记了 @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    // 交由 Passport JWT 策略验证 Bearer Token
    return super.canActivate(context)
  }

  /**
   * 统一处理鉴权失败：转为 BusinessException
   */
  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | undefined,
    _info?: unknown,
    _context?: ExecutionContext,
  ): TUser {
    if (err || !user) {
      throw new BusinessException(
        ErrorCode.UNAUTHORIZED,
        '登录已过期或未登录，请重新登录',
        undefined,
        HttpStatus.UNAUTHORIZED,
      )
    }
    return user
  }
}
