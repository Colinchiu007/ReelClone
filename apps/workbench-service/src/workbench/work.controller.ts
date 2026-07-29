/**
 * WorkController — 作品 API
 *
 * 路由前缀：api/v1/works（由 main.ts 全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - GET    /      作品列表（需 JWT，分页 + 筛选）
 *  - GET    /:id   作品详情（需 JWT，校验所有权）
 *  - DELETE /:id   删除作品（需 JWT，软删除）
 */
import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '@reelclone/common';
import { WorkService } from './work.service';
import { ListWorksDto } from './dto/list-works.dto';

@Controller('works')
export class WorkController {
  constructor(private readonly workService: WorkService) {}

  /**
   * GET /api/v1/works
   * 作品列表（分页 + 筛选）
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() dto: ListWorksDto,
  ) {
    return this.workService.findAll(userId, dto);
  }

  /**
   * GET /api/v1/works/:id
   * 作品详情（校验所有权）
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.workService.findOne(userId, id);
  }

  /**
   * DELETE /api/v1/works/:id
   * 删除作品（软删除：status=DELETED，保留 OSS 文件 30 天）
   */
  @Delete(':id')
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    await this.workService.delete(userId, id);
    return { deleted: true, workId: id };
  }
}
