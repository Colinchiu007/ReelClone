/**
 * WorkController — 作品 API
 *
 * 路由前缀：api/v1/works（由 main.ts 全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - GET    /                      作品列表（需 JWT，分页 + 筛选）
 *  - GET    /:id                   作品详情（需 JWT，校验所有权）
 *  - DELETE /:id                   删除作品（需 JWT，软删除）
 *  - POST   /:id/publish-template  作品转模板（需 JWT）
 */
import { Controller, Delete, Get, Post, Body, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@reelclone/common'
import { WorkService } from './work.service'
import { ListWorksDto } from './dto/list-works.dto'
import { PublishFromWorkDto } from './dto/publish-from-work.dto'

@ApiTags('work')
@Controller('works')
export class WorkController {
  constructor(private readonly workService: WorkService) {}

  /**
   * GET /api/v1/works
   * 作品列表（分页 + 筛选）
   */
  @Get()
  @ApiOperation({ summary: '作品列表（分页 + 筛选）' })
  async findAll(@CurrentUser('userId') userId: string, @Query() dto: ListWorksDto) {
    return this.workService.findAll(userId, dto)
  }

  /**
   * GET /api/v1/works/:id
   * 作品详情（校验所有权）
   */
  @Get(':id')
  @ApiOperation({ summary: '作品详情（校验所有权）' })
  async findOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.workService.findOne(userId, id)
  }

  /**
   * DELETE /api/v1/works/:id
   * 删除作品（软删除：status=DELETED，保留 OSS 文件 30 天）
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除作品（软删除，保留 OSS 文件 30 天）' })
  async delete(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    await this.workService.delete(userId, id)
    return { deleted: true, workId: id }
  }

  /**
   * POST /api/v1/works/:id/publish-template
   * 将已完成的作品发布为模板（需 JWT）
   * 作品状态必须为 COMPLETED 且有视频结果（resultKey）。
   */
  @Post(':id/publish-template')
  @ApiOperation({ summary: '作品转模板（发布已完成作品为模板）' })
  async publishTemplate(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: PublishFromWorkDto,
  ) {
    return this.workService.publishAsTemplate(userId, id, dto)
  }
}
