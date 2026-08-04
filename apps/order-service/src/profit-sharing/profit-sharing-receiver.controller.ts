/**
 * ProfitSharingReceiverController — 管理后台分账接收方 CRUD
 *
 * 路由前缀：api/v1/admin/profit-sharing/receivers
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）：
 *  - GET    /       接收方列表
 *  - GET    /:id    接收方详情
 *  - POST   /       创建接收方
 *  - PUT    /:id    更新接收方
 *  - DELETE /:id    删除接收方（软删除）
 */
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '@reelclone/common'
import { ProfitSharingReceiverService } from './profit-sharing-receiver.service'
import { CreateReceiverDto } from './dto/create-receiver.dto'
import { UpdateReceiverDto } from './dto/update-receiver.dto'

@ApiTags('admin-profit-sharing-receiver')
@Controller('admin/profit-sharing/receivers')
@Roles('ADMIN', 'SUPER_ADMIN')
export class ProfitSharingReceiverController {
  constructor(private readonly receiverService: ProfitSharingReceiverService) {}

  @Get()
  @ApiOperation({ summary: '分账接收方列表' })
  async findAll() {
    return this.receiverService.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: '分账接收方详情' })
  async findOne(@Param('id') id: string) {
    return this.receiverService.findOne(id)
  }

  @Post()
  @ApiOperation({ summary: '创建分账接收方' })
  async create(@Body() dto: CreateReceiverDto) {
    return this.receiverService.create(dto)
  }

  @Put(':id')
  @ApiOperation({ summary: '更新分账接收方' })
  async update(@Param('id') id: string, @Body() dto: UpdateReceiverDto) {
    return this.receiverService.update(id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除分账接收方（软删除）' })
  async remove(@Param('id') id: string) {
    return this.receiverService.remove(id)
  }
}
