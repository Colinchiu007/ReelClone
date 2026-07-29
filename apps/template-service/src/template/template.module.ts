/**
 * 模板业务模块
 *
 * 导入:
 *  - template 库: Template, Favorite 实体
 *  - main 库:     User 实体（仅用于读取/更新 industryPreferences）
 *
 * 提供:
 *  - TemplateService:  模板列表/详情
 *  - FavoriteService:  收藏/取消收藏/收藏列表
 *
 * 控制器:
 *  - TemplateController: api/v1/templates
 *  - IndustryController: api/v1/users/industry-preferences
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Template,
  Favorite,
  User,
  DATABASE_CONNECTIONS,
} from '@reelclone/database';
import { TemplateService } from './template.service';
import { FavoriteService } from './favorite.service';
import { TemplateController } from './template.controller';
import { IndustryController } from './industry.controller';

@Module({
  imports: [
    // template 库实体
    TypeOrmModule.forFeature(
      [Template, Favorite],
      DATABASE_CONNECTIONS.TEMPLATE,
    ),
    // main 库实体（User: 行业偏好读写）
    TypeOrmModule.forFeature([User], DATABASE_CONNECTIONS.MAIN),
  ],
  controllers: [TemplateController, IndustryController],
  providers: [TemplateService, FavoriteService],
  exports: [TemplateService, FavoriteService],
})
export class TemplateModule {}
