/**
 * 真人形象组控制器
 *
 * 端点（全局前缀 api/v1）：
 * - POST   /api/v1/avatar-groups      创建真人形象组（需 JWT）
 * - GET    /api/v1/avatar-groups      形象组列表（需 JWT，分页）
 * - GET    /api/v1/avatar-groups/:id  详情（含组内资产列表，需 JWT）
 * - PUT    /api/v1/avatar-groups/:id  更新（需 JWT，校验所有权）
 * - DELETE /api/v1/avatar-groups/:id  删除（需 JWT，校验所有权，级联删除组内资产）
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@reelclone/common';
import { AvatarGroupService } from './avatar-group.service';
import {
  CreateAvatarGroupDto,
  ListAvatarGroupsDto,
  UpdateAvatarGroupDto,
} from './dto/create-avatar-group.dto';

@Controller('avatar-groups')
export class AvatarGroupController {
  constructor(private readonly avatarGroupService: AvatarGroupService) {}

  /**
   * POST /api/v1/avatar-groups
   * 创建真人形象组（同用户下名称唯一）
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAvatarGroupDto,
  ) {
    return this.avatarGroupService.create(userId, dto);
  }

  /**
   * GET /api/v1/avatar-groups
   * 当前用户的真人形象组列表（仅 ACTIVE）
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: ListAvatarGroupsDto,
  ) {
    return this.avatarGroupService.findAll(userId, query);
  }

  /**
   * GET /api/v1/avatar-groups/:id
   * 详情（含组内资产列表）
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.avatarGroupService.findOne(userId, id);
  }

  /**
   * PUT /api/v1/avatar-groups/:id
   * 更新（名称变更时重新校验唯一性）
   */
  @Put(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAvatarGroupDto,
  ) {
    return this.avatarGroupService.update(userId, id, dto);
  }

  /**
   * DELETE /api/v1/avatar-groups/:id
   * 删除：级联删除组内所有资产（OSS + DB）后软删除形象组
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.avatarGroupService.delete(userId, id);
  }
}
