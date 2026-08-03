/**
 * 套餐管理控制器（admin-service）
 *
 * 前缀: api/v1/admin/packages（api/v1 为全局前缀）
 *
 * 端点（均需 ADMIN / SUPER_ADMIN 角色）:
 *  - POST /              创建套餐（新建后默认 OFFLINE）
 *  - PUT  /:id           编辑套餐
 *  - PUT  /:id/status    上架 / 下架
 *  - GET  /              套餐列表（全状态）
 *
 * 权限：Controller 级别声明 @Roles('ADMIN', 'SUPER_ADMIN')，配合全局 RolesGuard 强制管理员权限。
 */
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser, Roles } from '@reelclone/common'
import { AdminPackageService } from './admin-package.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { UpdatePackageDto } from './dto/update-package.dto'
import { UpdatePackageStatusDto } from './dto/update-package-status.dto'

@ApiTags('admin-package')
@Controller('admin/packages')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminPackageController {
  constructor(private readonly adminPackageService: AdminPackageService) {}

  /**
   * 创建套餐（新建后默认 OFFLINE）
   */
  @Post()
  @ApiOperation({ summary: '创建套餐' })
  async create(@Body() dto: CreatePackageDto, @CurrentUser('userId') operatorId: string) {
    return this.adminPackageService.create(dto, operatorId)
  }

  /**
   * 编辑套餐
   */
  @Put(':id')
  @ApiOperation({ summary: '编辑套餐' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePackageDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminPackageService.update(id, dto, operatorId)
  }

  /**
   * 上架 / 下架
   * body: { status: 'ACTIVE' | 'OFFLINE' }
   */
  @Put(':id/status')
  @ApiOperation({ summary: '上架 / 下架套餐' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePackageStatusDto,
    @CurrentUser('userId') operatorId: string,
  ) {
    return this.adminPackageService.updateStatus(id, dto, operatorId)
  }

  /**
   * 套餐列表（全状态）
   */
  @Get()
  @ApiOperation({ summary: '套餐列表（全状态）' })
  async findAll() {
    return this.adminPackageService.findAll()
  }
}
