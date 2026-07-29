/**
 * GenerationController — 生成任务 API
 *
 * 路由前缀：api/v1/generations（由 main.ts 全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - POST   /            提交生成任务（需 JWT）
 *  - GET    /            任务列表（需 JWT，分页）
 *  - GET    /:id         任务详情（需 JWT）
 *  - POST   /:id/cancel  取消任务（需 JWT）
 *  - POST   /:id/retry   重试任务（需 JWT）
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@reelclone/common';
import { GenerationService } from './generation.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { ListGenerationsDto } from './dto/list-generations.dto';

@Controller('generations')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  /**
   * POST /api/v1/generations
   * 提交生成任务
   */
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateGenerationDto,
  ) {
    return this.generationService.create(userId, dto);
  }

  /**
   * GET /api/v1/generations
   * 任务列表（分页 + 筛选）
   */
  @Get()
  async findAll(
    @CurrentUser('userId') userId: string,
    @Query() dto: ListGenerationsDto,
  ) {
    return this.generationService.findAll(userId, dto);
  }

  /**
   * GET /api/v1/generations/:id
   * 任务详情
   */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.generationService.findOne(userId, id);
  }

  /**
   * POST /api/v1/generations/:id/cancel
   * 取消任务
   */
  @Post(':id/cancel')
  async cancel(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    await this.generationService.cancel(userId, id);
    return { cancelled: true, taskId: id };
  }

  /**
   * POST /api/v1/generations/:id/retry
   * 重试任务
   */
  @Post(':id/retry')
  async retry(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.generationService.retry(userId, id);
  }
}
