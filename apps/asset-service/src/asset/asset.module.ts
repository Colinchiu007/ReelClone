/**
 * 资产模块
 *
 * 注册 main 库的 Asset + AvatarGroup 实体仓储，
 * 提供 AssetService / AvatarGroupService 与对应控制器。
 *
 * OSSService / STSService 由 OSSModule.forRoot() 全局提供，可直接注入。
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset, AvatarGroup, DATABASE_CONNECTIONS } from '@reelclone/database';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { AvatarGroupController } from './avatar-group.controller';
import { AvatarGroupService } from './avatar-group.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Asset, AvatarGroup], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [AssetController, AvatarGroupController],
  providers: [AssetService, AvatarGroupService],
  exports: [AssetService, AvatarGroupService],
})
export class AssetModule {}
