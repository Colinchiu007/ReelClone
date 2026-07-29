/**
 * @Roles() 方法/类装饰器
 *
 * 标记端点所需的角色，配合 RolesGuard 使用。
 * RolesGuard 会校验 request.user.role 是否在允许的角色列表中。
 * 需配合 JwtAuthGuard 使用（先验证 JWT，再校验角色）。
 *
 * @example
 * ```ts
 * @Get('admin-data')
 * @Roles('ADMIN', 'SUPER_ADMIN')
 * getAdminData() { ... }
 * ```
 */
import { SetMetadata } from '@nestjs/common'

/** 角色 metadata key */
export const ROLES_KEY = 'roles'

/**
 * 标记端点所需的角色
 *
 * @param roles 允许访问的角色列表
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
