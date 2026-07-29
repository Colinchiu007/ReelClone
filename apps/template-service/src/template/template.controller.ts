/**
 * 模板控制器
 *
 * 前缀: api/v1/templates（api/v1 为全局前缀）
 *
 * 端点:
 *  - GET    /                    模板广场列表（公开，分页 + 筛选 + 排序）
 *  - POST   /publish             用户发布模板（需 JWT）
 *  - POST   /internal/publish    内部接口：发布模板（服务间调用）
 *  - GET    /pending-review      待审核模板列表（需 JWT + ADMIN 角色）
 *  - GET    /my-published        我发布的模板列表（需 JWT，分页）
 *  - GET    /favorites           我的收藏列表（需 JWT，分页）
 *  - GET    /:id                 模板详情（公开）
 *  - POST   /:id/review          审核模板（需 JWT + ADMIN 角色）
 *  - POST   /:id/increment-use   内部接口：使用次数 +1（服务间调用）
 *  - POST   /:id/favorite        收藏模板（需 JWT）
 *  - DELETE /:id/favorite        取消收藏（需 JWT）
 *
 * 注意: 静态路由（publish/internal/publish/pending-review/my-published/favorites）
 *       必须在 /:id 之前定义，否则会被当作 :id 参数。
 */
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Public, CurrentUser, Roles, RolesGuard } from '@reelclone/common'
import { TemplateService } from './template.service'
import { FavoriteService } from './favorite.service'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { PublishTemplateDto } from './dto/publish-template.dto'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { PaginationDto } from '@reelclone/common'

@Controller('templates')
@UseGuards(RolesGuard)
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly favoriteService: FavoriteService,
  ) {}

  /**
   * 模板广场列表（公开）
   * 支持分页 + 平台/行业/关键词筛选 + heat/latest/iq 排序
   */
  @Public()
  @Get()
  async list(@Query() dto: ListTemplatesDto) {
    return this.templateService.findAll(dto)
  }

  /**
   * 用户发布模板（需 JWT）
   * 将作品转为模板，提交后进入待审核状态。
   */
  @Post('publish')
  async publish(@CurrentUser('userId') userId: string, @Body() dto: PublishTemplateDto) {
    return this.templateService.publishFromWork(userId, dto)
  }

  /**
   * 内部接口：发布模板（服务间调用，TODO: 加内部 API Key 守卫）
   * workbench-service 通过 HTTP 调用，userId 在 body 中传递。
   */
  @Public()
  @Post('internal/publish')
  async internalPublish(@Body() body: PublishTemplateDto & { userId: string }) {
    const { userId, ...dto } = body
    return this.templateService.publishFromWork(userId, dto)
  }

  /**
   * 待审核模板列表（需 JWT + 管理员角色）
   * 运营查询待审核模板，分页返回。
   */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('pending-review')
  async pendingReview(@Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 20
    return this.templateService.findPendingReview(page, pageSize)
  }

  /**
   * 我发布的模板列表（需 JWT）
   * 查询当前用户发布的所有模板，分页返回。
   */
  @Get('my-published')
  async myPublished(@CurrentUser('userId') userId: string, @Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 20
    return this.templateService.findMyPublished(userId, page, pageSize)
  }

  /**
   * 我的收藏列表（需 JWT）
   * 按 Favorite.createdAt 倒序，分页返回
   */
  @Get('favorites')
  async myFavorites(@CurrentUser('userId') userId: string, @Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 20
    return this.favoriteService.findMyFavorites(userId, page, pageSize)
  }

  /**
   * 模板详情（公开）
   */
  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.templateService.findOne(id)
  }

  /**
   * 审核模板（需 JWT + 管理员角色）
   * 设置模板审核状态（ACTIVE / REJECTED）及审核备注。
   */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post(':id/review')
  async review(@Param('id') id: string, @Body() dto: ReviewTemplateDto) {
    return this.templateService.review(id, dto)
  }

  /**
   * 内部接口：模板使用次数 +1（服务间调用，TODO: 加内部 API Key 守卫）
   * workbench-service 在"基于模板创作"时通过 HTTP 调用。
   */
  @Public()
  @Post(':id/increment-use')
  async incrementUse(@Param('id') id: string) {
    await this.templateService.incrementUseCount(id)
    return { success: true }
  }

  /**
   * 收藏模板（需 JWT，幂等）
   */
  @Post(':id/favorite')
  async favorite(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.favoriteService.favorite(userId, id)
  }

  /**
   * 取消收藏（需 JWT，幂等）
   */
  @Delete(':id/favorite')
  async unfavorite(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.favoriteService.unfavorite(userId, id)
  }
}
