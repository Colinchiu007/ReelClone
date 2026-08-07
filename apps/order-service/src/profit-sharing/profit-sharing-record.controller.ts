/**
 * ProfitSharingRecordController — 管理后台分账记录查询
 *
 * 路由前缀：api/v1/admin/profit-sharing/records
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - GET  /       分账记录列表（分页 + status/orderNo 筛选）
 *  - GET  /:id    分账记录详情（含 items）
 *  - POST /:id/retry  手动重试失败的分账
 */
import { Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '@reelclone/common'
import { ProfitSharingService } from './profit-sharing.service'
import { ListRecordsDto } from './dto/list-records.dto'

@ApiTags('admin-profit-sharing-record')
@Controller('admin/profit-sharing/records')
@Roles('ADMIN', 'SUPER_ADMIN')
export class ProfitSharingRecordController {
  constructor(
    private readonly profitSharingService: ProfitSharingService,
  ) {}

  /**
   * GET /api/v1/admin/profit-sharing/records
   * 分账记录列表（分页 + status / orderNo 筛选）
   */
  @Get()
  @ApiOperation({ summary: '分账记录列表（分页 + 筛选）' })
  async findAll(@Query() dto: ListRecordsDto) {
    return this.profitSharingService.listRecords(dto)
  }

  /**
   * GET /api/v1/admin/profit-sharing/records/:id
   * 分账记录详情（含明细项）
   */
  @Get(':id')
  @ApiOperation({ summary: '分账记录详情（含明细）' })
  async findOne(@Param('id') id: string) {
    return this.profitSharingService.getRecordDetail(id)
  }

  /**
   * POST /api/v1/admin/profit-sharing/records/:id/retry
   * 手动重试失败的分账
   */
  @Post(':id/retry')
  @ApiOperation({ summary: '重试失败的分账' })
  async retry(@Param('id') id: string) {
    return this.profitSharingService.retryProfitSharing(id)
  }
}
