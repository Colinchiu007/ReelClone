/**
 * 模板控制器
 *
 * 前缀: api/v1/templates（api/v1 为全局前缀）
 *
 * 端点:
 *  - GET    /          模板广场列表（公开，分页 + 筛选 + 排序）
 *  - GET    /favorites 我的收藏列表（需 JWT，分页）
 *  - GET    /:id       模板详情（公开）
 *  - POST   /:id/favorite   收藏模板（需 JWT）
 *  - DELETE /:id/favorite   取消收藏（需 JWT）
 *
 * 注意: /favorites 路由必须在 /:id 之前定义，否则 "favorites" 会被当作 :id 参数。
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
} from '@nestjs/common';
import { Public, CurrentUser } from '@reelclone/common';
import { TemplateService } from './template.service';
import { FavoriteService } from './favorite.service';
import { ListTemplatesDto } from './dto/list-templates.dto';
import { PaginationDto } from '@reelclone/common';

@Controller('templates')
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
    return this.templateService.findAll(dto);
  }

  /**
   * 我的收藏列表（需 JWT）
   * 按 Favorite.createdAt 倒序，分页返回
   */
  @Get('favorites')
  async myFavorites(
    @CurrentUser('userId') userId: string,
    @Query() pagination: PaginationDto,
  ) {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    return this.favoriteService.findMyFavorites(userId, page, pageSize);
  }

  /**
   * 模板详情（公开）
   */
  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  /**
   * 收藏模板（需 JWT，幂等）
   */
  @Post(':id/favorite')
  async favorite(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.favoriteService.favorite(userId, id);
  }

  /**
   * 取消收藏（需 JWT，幂等）
   */
  @Delete(':id/favorite')
  async unfavorite(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.favoriteService.unfavorite(userId, id);
  }
}
