/**
 * RolesGuard — 基于 @Roles() 元数据校验用户角色
 *
 * 配合 @Roles() 装饰器使用，对接口进行 RBAC 角色校验。
 * 需配合 JwtAuthGuard 使用（先验证 JWT，将 user 注入 request，再校验角色）。
 *
 * 使用方式：
 * 1. 在控制器上挂载守卫：@UseGuards(JwtAuthGuard, RolesGuard)
 * 2. 在方法上声明所需角色：@Roles('ADMIN')
 *
 * 校验逻辑：
 * - 未设置 @Roles() 装饰器时直接放行（向后兼容）
 * - request.user.role 在允许角色列表中时放行，否则抛 ForbiddenException
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // 未设置 @Roles() 装饰器时直接放行
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>()
    const user = request.user

    if (!user || !user.role) {
      throw new ForbiddenException({ message: '需要管理员权限' })
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException({ message: '需要管理员权限' })
    }

    return true
  }
}
