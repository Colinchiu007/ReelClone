/**
 * AppController — admin-service 健康检查
 *
 * 路由前缀：api/v1/admin（由 main.ts 的全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - GET /api/v1/admin/health  健康检查（公开，无需鉴权）
 *
 * 后续业务端点（Task 7+）将新增独立 Controller（如 AdminUserController），
 * 并在 Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN') 强制管理员权限。
 */
import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '@reelclone/common'

@ApiTags('admin-app')
@Controller('admin')
export class AppController {
  /**
   * GET /api/v1/admin/health
   * 健康检查，返回服务状态。
   * 使用 @Public() 跳过 JWT 鉴权，供负载均衡 / K8s 探针调用。
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: '健康检查' })
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'admin-service' }
  }
}
