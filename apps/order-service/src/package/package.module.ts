/**
 * 套餐业务模块
 *
 * 导入:
 *  - main 库: Package 实体
 *
 * 提供:
 *  - PackageService: 套餐列表/详情
 *
 * 控制器:
 *  - PackageController: api/v1/packages
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Package, DATABASE_CONNECTIONS } from '@reelclone/database';
import { PackageService } from './package.service';
import { PackageController } from './package.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Package], DATABASE_CONNECTIONS.MAIN)],
  controllers: [PackageController],
  providers: [PackageService],
  exports: [PackageService],
})
export class PackageModule {}
