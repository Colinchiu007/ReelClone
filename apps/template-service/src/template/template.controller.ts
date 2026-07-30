/**
 * 模板控制器
 *
 * 前缀: api/v1/templates（api/v1 为全局前缀）
 *
 * 端点:
 *  - GET    /                              模板广场列表（公开，分页 + 筛选 + 排序）
 *  - POST   /upload                        用户上传视频转模板（需 JWT）
 *  - GET    /upload/:workflowId/status     查询上传转模板进度（需 JWT）
 *  - GET    /my-uploaded                   我上传的模板列表（需 JWT）
 *  - GET    /my-published                  我发布的模板列表（需 JWT）
 *  - GET    /pending-review                待审核模板列表（需 JWT + ADMIN 角色）
 *  - GET    /favorites                     我的收藏列表（需 JWT，分页）
 *  - POST   /publish                       用户发布模板（需 JWT）
 *  - POST   /internal/publish              内部接口：发布模板（服务间调用）
 *  - POST   /internal/finalize             内部接口：完成模板（Temporal Activity 调用）
 *  - POST   /internal/fail                 内部接口：标记模板失败（Temporal Activity 调用）
 *  - GET    /:id                           模板详情（公开）
 *  - POST   /:id/review                    审核模板（需 JWT + ADMIN 角色）
 *  - POST   /:id/increment-use             内部接口：使用次数 +1（服务间调用，含积分奖励）
 *  - POST   /:id/favorite                  收藏模板（需 JWT）
 *  - DELETE /:id/favorite                  取消收藏（需 JWT）
 *
 * 注意: 静态路由（upload/my-uploaded/my-published/pending-review/favorites/publish/internal/*）
 *       必须在 /:id 之前定义，否则会被当作 :id 参数。
 */
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { Public, CurrentUser, Roles, RolesGuard, InternalApi } from '@reelclone/common'
import { TemplateService } from './template.service'
import { FavoriteService } from './favorite.service'
import { ListTemplatesDto } from './dto/list-templates.dto'
import { PublishTemplateDto } from './dto/publish-template.dto'
import { ReviewTemplateDto } from './dto/review-template.dto'
import { UploadTemplateDto } from './dto/upload-template.dto'
import { FailTemplateDto, FinalizeTemplateInternalDto } from './dto/finalize-template.dto'
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
   * 用户上传视频转模板（需 JWT）
   * 提交后进入 ANALYZING 状态，Temporal 工作流异步分析视频生成模板。
   */
  @Post('upload')
  async upload(@CurrentUser('userId') userId: string, @Body() dto: UploadTemplateDto) {
    return this.templateService.submitUpload(userId, dto)
  }

  /**
   * 查询上传转模板进度（需 JWT）
   * 前端轮询此接口获取状态（ANALYZING → ACTIVE / ANALYSIS_FAILED）。
   */
  @Get('upload/:workflowId/status')
  async uploadStatus(
    @CurrentUser('userId') userId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.templateService.getUploadStatus(workflowId, userId)
  }

  /**
   * 我上传的模板列表（需 JWT）
   * 包含 ACTIVE / ANALYZING / ANALYSIS_FAILED 三种状态。
   */
  @Get('my-uploaded')
  async myUploaded(@CurrentUser('userId') userId: string, @Query() pagination: PaginationDto) {
    const page = pagination.page ?? 1
    const pageSize = pagination.pageSize ?? 20
    return this.templateService.findMyUploaded(userId, page, pageSize)
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
   * 内部接口：发布模板（服务间调用，@InternalApi 校验 x-api-key）
   * workbench-service 通过 HTTP 调用，userId 在 body 中传递。
   */
  @Public()
  @InternalApi()
  @Post('internal/publish')
  async internalPublish(@Body() body: PublishTemplateDto & { userId: string }) {
    const { userId, ...dto } = body
    return this.templateService.publishFromWork(userId, dto)
  }

  /**
   * 内部接口：完成模板（Temporal Activity 通过 HTTP 调用，@InternalApi 校验 x-api-key）
   * 工作流执行完成后回写视频元数据、分析报告、模板建议、封面 Key，状态置为 ACTIVE。
   */
  @Public()
  @InternalApi()
  @Post('internal/finalize')
  async internalFinalize(@Body() dto: FinalizeTemplateInternalDto) {
    return this.templateService.internalFinalize(dto)
  }

  /**
   * 内部接口：标记模板失败（Temporal Activity 通过 HTTP 调用，@InternalApi 校验 x-api-key）
   * 工作流执行异常时将状态置为 ANALYSIS_FAILED，记录失败原因，允许用户重试。
   */
  @Public()
  @InternalApi()
  @Post('internal/fail')
  async internalFail(@Body() dto: FailTemplateDto) {
    return this.templateService.internalFail(dto)
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
   * 内部接口：模板使用次数 +1（服务间调用，含积分奖励，@InternalApi 校验 x-api-key）
   * workbench-service 在"基于模板创作"时通过 HTTP 调用。
   * 若模板有上传者（userId 非空），会触发 billing-service 积分奖励（幂等）。
   */
  @Public()
  @InternalApi()
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
