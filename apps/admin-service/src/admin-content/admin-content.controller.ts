/**
 * 内容管理控制器（AdminContentController）
 *
 * 路由前缀：admin（与全局前缀 api/v1 拼接后为 /api/v1/admin/...）
 *
 * 端点（全部需要 ADMIN / SUPER_ADMIN 角色）：
 *  - GET    /admin/works              全平台作品列表（分页 + 筛选）
 *  - DELETE /admin/works/:id          强制下架作品
 *  - GET    /admin/templates          全状态模板列表
 *  - PUT    /admin/templates/:id/status  模板上下架
 *
 * 权限：Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN')，由全局 RolesGuard 校验。
 * 操作者：通过 @CurrentUser('userId') 获取管理员 ID，传递给 Service 用于审计日志。
 */
import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, Roles } from '@reelclone/common'
import { AdminContentService } from './admin-content.service'
import { ListWorksDto } from './dto/list-works.dto'
import { TakedownWorkDto } from './dto/takedown-work.dto'
import { UpdateTemplateStatusDto } from './dto/update-template-status.dto'

// NOTE: 使用 'admin' 前缀而非 'admin/works' 或 'admin/templates'，因为本模块的端点跨多个资源路径
// （/works, /works/:id, /templates, /templates/:id/status）
@ApiTags('admin-content')
@Controller('admin')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminContentController {
  constructor(private readonly service: AdminContentService) {}

  /**
   * GET /api/v1/admin/works
   * 全平台作品列表，支持 ?status=&userId=&startDate=&endDate=&page=&pageSize=
   */
  @Get('works')
  @ApiOperation({ summary: '全平台作品列表（分页 + 筛选）' })
  listWorks(@Query() query: ListWorksDto) {
    return this.service.listWorks(query)
  }

  /**
   * DELETE /api/v1/admin/works/:id
   * 强制下架作品，body: { reason: string }
   * Work.status 改为 CANCELLED，记录下架日志 + 通知创作者
   */
  @Delete('works/:id')
  @ApiOperation({ summary: '强制下架作品' })
  takedownWork(
    @Param('id') id: string,
    @Body() dto: TakedownWorkDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.takedownWork(id, dto, userId)
  }

  /**
   * GET /api/v1/admin/templates
   * 全状态模板列表（含 PENDING_REVIEW / ACTIVE / OFFLINE / REJECTED）
   */
  @Get('templates')
  @ApiOperation({ summary: '全状态模板列表' })
  listTemplates() {
    return this.service.listTemplates()
  }

  /**
   * PUT /api/v1/admin/templates/:id/status
   * 模板上下架，body: { status: 'ACTIVE' | 'OFFLINE' }
   */
  @Put('templates/:id/status')
  @ApiOperation({ summary: '模板上下架' })
  updateTemplateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateStatusDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.updateTemplateStatus(id, dto, userId)
  }
}
