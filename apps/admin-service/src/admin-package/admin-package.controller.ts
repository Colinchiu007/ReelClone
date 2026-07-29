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
import { Roles } from '@reelclone/common'
import { AdminPackageService } from './admin-package.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { UpdatePackageDto } from './dto/update-package.dto'
import { UpdatePackageStatusDto } from './dto/update-package-status.dto'

@Controller('admin/packages')
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminPackageController {
  constructor(private readonly adminPackageService: AdminPackageService) {}

  /**
   * 创建套餐（新建后默认 OFFLINE）
   */
  @Post()
  async create(@Body() dto: CreatePackageDto) {
    return this.adminPackageService.create(dto)
  }

  /**
   * 编辑套餐
   */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.adminPackageService.update(id, dto)
  }

  /**
   * 上架 / 下架
   * body: { status: 'ACTIVE' | 'OFFLINE' }
   */
  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdatePackageStatusDto) {
    return this.adminPackageService.updateStatus(id, dto)
  }

  /**
   * 套餐列表（全状态）
   */
  @Get()
  async findAll() {
    return this.adminPackageService.findAll()
  }
}
