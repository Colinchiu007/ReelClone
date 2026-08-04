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
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DATABASE_CONNECTIONS,
  ProfitSharingRecord,
  ProfitSharingItem,
} from '@reelclone/database'
import { ProfitSharingService } from './profit-sharing.service'
import { ListRecordsDto } from './dto/list-records.dto'

@ApiTags('admin-profit-sharing-record')
@Controller('admin/profit-sharing/records')
@Roles('ADMIN', 'SUPER_ADMIN')
export class ProfitSharingRecordController {
  constructor(
    @InjectRepository(ProfitSharingRecord, DATABASE_CONNECTIONS.MAIN)
    private readonly recordRepo: Repository<ProfitSharingRecord>,
    @InjectRepository(ProfitSharingItem, DATABASE_CONNECTIONS.MAIN)
    private readonly itemRepo: Repository<ProfitSharingItem>,
    private readonly profitSharingService: ProfitSharingService,
  ) {}

  /**
   * GET /api/v1/admin/profit-sharing/records
   * 分账记录列表（分页 + status / orderNo 筛选）
   */
  @Get()
  @ApiOperation({ summary: '分账记录列表（分页 + 筛选）' })
  async findAll(@Query() dto: ListRecordsDto) {
    const page = dto.page ?? 1
    const pageSize = dto.pageSize ?? 20

    const qb = this.recordRepo.createQueryBuilder('r')

    if (dto.status) {
      qb.andWhere('r.status = :status', { status: dto.status })
    }
    if (dto.orderNo) {
      qb.andWhere('r.orderNo = :orderNo', { orderNo: dto.orderNo })
    }

    qb.orderBy('r.createdAt', 'DESC')
    qb.skip((page - 1) * pageSize).take(pageSize)

    const [list, total] = await qb.getManyAndCount()

    return { list, page, pageSize, total }
  }

  /**
   * GET /api/v1/admin/profit-sharing/records/:id
   * 分账记录详情（含明细项）
   */
  @Get(':id')
  @ApiOperation({ summary: '分账记录详情（含明细）' })
  async findOne(@Param('id') id: string) {
    const record = await this.recordRepo.findOne({ where: { id } })
    if (!record) {
      return null
    }

    const items = await this.itemRepo.find({
      where: { recordId: id },
      order: { createdAt: 'ASC' },
    })

    return { ...record, items }
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
