/**
 * 套餐管理业务模块（admin-service）
 *
 * 导入:
 *  - main 库: Package 实体
 *
 * 提供:
 *  - AdminPackageService: 套餐 CRUD 与上下架
 *
 * 控制器:
 *  - AdminPackageController: api/v1/admin/packages
 *
 * 注意：本模块需在 AppModule 中注册后生效（当前未注册，待后续接入）。
 */
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Package, DATABASE_CONNECTIONS } from '@reelclone/database'
import { AdminPackageController } from './admin-package.controller'
import { AdminPackageService } from './admin-package.service'

@Module({
  imports: [TypeOrmModule.forFeature([Package], DATABASE_CONNECTIONS.MAIN)],
  controllers: [AdminPackageController],
  providers: [AdminPackageService],
  exports: [AdminPackageService],
})
export class AdminPackageModule {}
