/**
 * BenchmarkController — 对标解析 API
 *
 * 路由前缀：api/v1/benchmarks（由 main.ts 的全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - POST /api/v1/benchmarks           提交对标解析任务（需 JWT）
 *  - GET  /api/v1/benchmarks           解析历史（需 JWT，分页）
 *  - GET  /api/v1/benchmarks/:id       解析详情（需 JWT，校验所有权）
 *  - POST /api/v1/benchmarks/:id/cancel 取消解析（需 JWT）
 *  - POST /api/v1/benchmarks/:id/clone  生成一键复刻建议（需 JWT）
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '@reelclone/common'
import { BenchmarkService } from './benchmark.service'
import { CreateBenchmarkDto } from './dto/create-benchmark.dto'
import { ListBenchmarksDto } from './dto/list-benchmarks.dto'

@ApiTags('benchmark')
@Controller('benchmarks')
export class BenchmarkController {
  constructor(private readonly benchmarkService: BenchmarkService) {}

  /**
   * POST /api/v1/benchmarks
   * 提交对标解析任务
   *
   * 请求体: { sourceUrl: string, idempotencyKey?: string }
   * 响应: { benchmarkId: string, status: 'PENDING', estimatedPoints: number }
   */
  @Post()
  @ApiOperation({ summary: '提交对标解析任务' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateBenchmarkDto) {
    return this.benchmarkService.create(userId, dto)
  }

  /**
   * GET /api/v1/benchmarks
   * 解析历史（分页 + 筛选）
   *
   * Query: page, pageSize, platform?, status?
   */
  @Get()
  @ApiOperation({ summary: '查询对标解析历史（分页 + 筛选）' })
  async findAll(@CurrentUser('userId') userId: string, @Query() dto: ListBenchmarksDto) {
    return this.benchmarkService.findAll(userId, dto)
  }

  /**
   * GET /api/v1/benchmarks/:id
   * 解析详情（校验所有权）
   */
  @Get(':id')
  @ApiOperation({ summary: '查询单条对标解析详情' })
  async findOne(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.benchmarkService.findOne(userId, id)
  }

  /**
   * POST /api/v1/benchmarks/:id/cancel
   * 取消解析任务
   *
   * 响应: { benchmarkId: string, status: 'CANCELLED' }
   */
  @Post(':id/cancel')
  @ApiOperation({ summary: '取消对标解析任务' })
  async cancel(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.benchmarkService.cancel(userId, id)
  }

  /**
   * POST /api/v1/benchmarks/:id/clone
   * 基于对标解析结果生成一键复刻建议参数
   *
   * 响应: { benchmarkId, prompt, model, resolution, aspectRatio, duration }
   */
  @Post(':id/clone')
  @ApiOperation({ summary: '生成一键复刻建议参数' })
  async clone(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.benchmarkService.clone(userId, id)
  }
}
