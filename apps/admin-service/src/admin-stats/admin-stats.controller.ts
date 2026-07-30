/**
 * AdminStatsController — 数据统计控制器
 *
 * 路由前缀：api/v1/admin/stats（api/v1 为全局前缀）
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - GET /overview        概览指标（DAU / 新增用户 / GMV / 生成量 / 积分消耗 + 趋势）
 *  - GET /points-flow     积分流水查询（分页）
 *
 * 鉴权：
 *  - 全局 JwtAuthGuard 校验 JWT（默认所有路由需登录）
 *  - @Roles('ADMIN', 'SUPER_ADMIN') 限制仅管理员可访问
 *  - @UseGuards(RolesGuard) 配合 @Roles() 做 RBAC 角色校验
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles, RolesGuard } from '@reelclone/common'
import { AdminStatsService } from './admin-stats.service'
import { OverviewQueryDto } from './dto/overview-query.dto'
import { PointsFlowQueryDto } from './dto/points-flow-query.dto'

@ApiTags('admin-stats')
@Controller('admin/stats')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  // -------------------- GET /admin/stats/overview --------------------

  /**
   * 概览指标
   *
   * 返回 dau / newUsers / gmv / generationCount / pointsConsumed + 按天趋势。
   * Query: range = '7d' | '30d'（默认 7d）
   */
  @Get('overview')
  @ApiOperation({ summary: '概览指标（DAU / 新增用户 / GMV / 生成量 / 积分消耗 + 趋势）' })
  async overview(@Query() dto: OverviewQueryDto) {
    return this.adminStatsService.getOverview(dto)
  }

  // -------------------- GET /admin/stats/points-flow --------------------

  /**
   * 积分流水查询
   *
   * 从 billing 库 point_transactions 表分页查询，支持 userId / startDate / endDate 筛选。
   */
  @Get('points-flow')
  @ApiOperation({ summary: '积分流水查询' })
  async pointsFlow(@Query() dto: PointsFlowQueryDto) {
    return this.adminStatsService.getPointsFlow(dto)
  }
}
