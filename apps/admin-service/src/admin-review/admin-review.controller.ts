/**
 * 审核工作台控制器
 *
 * 路由前缀：admin（与全局前缀 api/v1 拼接后为 /api/v1/admin）
 *
 * 端点（全部需要 @Roles('ADMIN', 'SUPER_ADMIN')）：
 *  - GET  /admin/reviews/pending                  聚合待审核列表（?type=template|avatar|asset|all）
 *  - POST /admin/templates/:id/review             模板审核
 *  - PUT  /admin/avatar-groups/:id/authorization  形象组授权审核
 *  - POST /admin/assets/:id/review                资产审核
 *
 * 所有端点均需 JWT + 管理员角色（全局 JwtAuthGuard + RolesGuard 生效）。
 */
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, Roles } from '@reelclone/common'
import { AdminReviewService } from './admin-review.service'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { ReviewAvatarGroupDto } from './dto/review-avatar-group.dto'
import { ReviewAssetDto } from './dto/review-asset.dto'

// NOTE: 使用 'admin' 前缀而非 'admin/reviews'，因为本模块的端点跨多个资源路径
// （/reviews/pending, /templates/:id/review, /avatar-groups/:id/authorization）
@ApiTags('admin-review')
@Controller('admin')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminReviewController {
  constructor(private readonly adminReviewService: AdminReviewService) {}

  /**
   * GET /api/v1/admin/reviews/pending
   * 聚合待审核列表，支持 ?type=template|avatar|all（默认 all）
   * 响应：{ templates: [...], avatarGroups: [...], total: number }
   */
  @Get('reviews/pending')
  @ApiOperation({ summary: '聚合待审核列表' })
  async pending(@Query('type') type?: string) {
    return this.adminReviewService.findPending(type ?? 'all')
  }

  /**
   * POST /api/v1/admin/templates/:id/review
   * 模板审核：更新 status + reviewNote + reviewedAt，并通知提交者
   */
  @Post('templates/:id/review')
  @ApiOperation({ summary: '模板审核' })
  async reviewTemplate(
    @Param('id') id: string,
    @Body() dto: ReviewTemplateDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminReviewService.reviewTemplate(id, dto, operatorId)
  }

  /**
   * PUT /api/v1/admin/avatar-groups/:id/authorization
   * 形象组授权审核：更新 authorizationStatus
   */
  @Put('avatar-groups/:id/authorization')
  @ApiOperation({ summary: '形象组授权审核' })
  async reviewAvatarGroup(
    @Param('id') id: string,
    @Body() dto: ReviewAvatarGroupDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminReviewService.reviewAvatarGroup(id, dto, operatorId)
  }

  /**
   * POST /api/v1/admin/assets/:id/review
   * 资产审核：更新 status + reviewNote + reviewedAt，并通知上传者
   */
  @Post('assets/:id/review')
  @ApiOperation({ summary: '资产审核' })
  async reviewAsset(
    @Param('id') id: string,
    @Body() dto: ReviewAssetDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminReviewService.reviewAsset(id, dto, operatorId)
  }
}
