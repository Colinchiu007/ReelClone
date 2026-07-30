/**
 * AdminUserController — 用户管理控制器
 *
 * 路由前缀：api/v1/admin/users（由 main.ts 全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - GET    /admin/users              分页列表（keyword/status/role 筛选）
 *  - GET    /admin/users/:id          用户详情
 *  - PUT    /admin/users/:id/status   封禁/解封
 *  - PUT    /admin/users/:id/role     角色变更（仅 SUPER_ADMIN）
 *  - POST   /admin/users/:id/grant-points  人工调账
 *
 * 权限：Controller 级别 @Roles('ADMIN', 'SUPER_ADMIN')，全局 JwtAuthGuard 已验证 JWT。
 */
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, Roles, RolesGuard } from '@reelclone/common'
import { AdminUserService } from './admin-user.service'
import { ListUsersDto } from './dto/list-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { UpdateUserRoleDto } from './dto/update-user-role.dto'
import { GrantPointsDto } from './dto/grant-points.dto'

@ApiTags('admin-user')
@Controller('admin/users')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminUserController {
  constructor(private readonly adminUserService: AdminUserService) {}

  // -------------------- GET /admin/users --------------------

  /**
   * 分页查询用户列表
   * 支持 keyword（昵称/手机号模糊搜索）、status 筛选、role 筛选。
   */
  @Get()
  @ApiOperation({ summary: '分页查询用户列表' })
  async listUsers(@Query() dto: ListUsersDto) {
    return this.adminUserService.listUsers(dto)
  }

  // -------------------- GET /admin/users/:id --------------------

  /**
   * 查询用户详情（含 currentPoints/totalPoints/role/status/lastLoginAt）
   */
  @Get(':id')
  @ApiOperation({ summary: '查询用户详情' })
  async getUserDetail(@Param('id') id: string) {
    return this.adminUserService.getUserDetail(id)
  }

  // -------------------- PUT /admin/users/:id/status --------------------

  /**
   * 封禁/解封用户
   * body: { status: 'ACTIVE' | 'FROZEN' }
   */
  @Put(':id/status')
  @ApiOperation({ summary: '封禁 / 解封用户' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.adminUserService.updateStatus(id, dto)
  }

  // -------------------- PUT /admin/users/:id/role --------------------

  /**
   * 变更用户角色（仅 SUPER_ADMIN 可操作）
   * body: { role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' }
   */
  @Put(':id/role')
  @ApiOperation({ summary: '变更用户角色（仅 SUPER_ADMIN）' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('role') operatorRole: string,
  ) {
    return this.adminUserService.updateRole(id, dto, operatorRole)
  }

  // -------------------- POST /admin/users/:id/grant-points --------------------

  /**
   * 人工调账（赠送积分）
   * body: { amount: number, reason: string }
   */
  @Post(':id/grant-points')
  @ApiOperation({ summary: '人工调账（赠送积分）' })
  async grantPoints(
    @Param('id') id: string,
    @Body() dto: GrantPointsDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminUserService.grantPoints(id, dto, operatorId)
  }
}
