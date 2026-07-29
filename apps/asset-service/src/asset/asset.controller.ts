/**
 * 资产控制器
 *
 * 端点（全局前缀 api/v1）：
 * - POST   /api/v1/assets/upload-token  获取 STS 上传凭证（需 JWT）
 * - GET    /api/v1/assets               资产列表（分页 + 筛选，需 JWT）
 * - POST   /api/v1/assets               创建资产记录（需 JWT）
 * - GET    /api/v1/assets/:id           资产详情（需 JWT，校验所有权）
 * - DELETE /api/v1/assets/:id           删除资产（需 JWT，校验所有权）
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
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@reelclone/common';
import { AssetService } from './asset.service';
import { CreateAssetDto, UploadTokenDto } from './dto/create-asset.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

@Controller('assets')
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  /**
   * POST /api/v1/assets/upload-token
   * 获取 STS Token + 表单上传 Policy / Signature，供小程序直传 OSS
   */
  @Post('upload-token')
  @HttpCode(HttpStatus.OK)
  async createUploadToken(
    @CurrentUser('userId') userId: string,
    @Body() dto: UploadTokenDto,
  ) {
    return this.assetService.createUploadToken(userId, dto);
  }

  /**
   * GET /api/v1/assets
   * 资产列表（仅返回当前用户的 ACTIVE 资产）
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: ListAssetsDto,
  ) {
    return this.assetService.findAll(userId, query);
  }

  /**
   * POST /api/v1/assets
   * 用户直传 OSS 完成后登记资产记录
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAssetDto,
  ) {
    return this.assetService.create(userId, dto);
  }

  /**
   * GET /api/v1/assets/:id
   * 资产详情（校验所有权）
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.assetService.findOne(userId, id);
  }

  /**
   * DELETE /api/v1/assets/:id
   * 删除资产：删除 OSS 文件 + 删除数据库记录（校验所有权）
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.assetService.delete(userId, id);
  }
}
