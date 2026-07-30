/**
 * 套餐控制器
 *
 * 前缀: api/v1/packages（api/v1 为全局前缀）
 *
 * 端点（均公开）:
 *  - GET /          套餐列表（按 sort、price 升序）
 *  - GET /:id       套餐详情
 */
import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '@reelclone/common'
import { PackageService } from './package.service'

@ApiTags('package')
@Controller('packages')
export class PackageController {
  constructor(private readonly packageService: PackageService) {}

  /**
   * 套餐列表（公开）
   */
  @Public()
  @Get()
  @ApiOperation({ summary: '套餐列表（公开）' })
  async list() {
    return this.packageService.findAll()
  }

  /**
   * 套餐详情（公开）
   */
  @Public()
  @Get(':id')
  @ApiOperation({ summary: '套餐详情（公开）' })
  async detail(@Param('id') id: string) {
    return this.packageService.findOne(id)
  }
}
