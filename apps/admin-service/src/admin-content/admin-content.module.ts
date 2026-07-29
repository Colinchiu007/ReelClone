/**
 * 内容管理模块（AdminContentModule）
 *
 * 装配：
 *  - DatabaseModule.forFeature([Work], 'main')      注入 main 库的 Work 仓储
 *  - DatabaseModule.forFeature([Template], 'template')  注入 template 库的 Template 仓储
 *  - AdminContentController                           REST 端点（/api/v1/admin/works, /templates）
 *  - AdminContentService                              业务逻辑
 *
 * 数据访问：
 *  - 作品管理 → main 库 works 表
 *  - 模板管理 → template 库 templates 表
 *
 * 注意：本模块需在 AppModule 中导入才会生效（Task 9 暂不修改 app.module.ts）。
 */
import { Module } from '@nestjs/common'
import { DATABASE_CONNECTIONS, DatabaseModule, Template, Work } from '@reelclone/database'
import { AdminContentController } from './admin-content.controller'
import { AdminContentService } from './admin-content.service'

@Module({
  imports: [
    // main 库的 Work 实体仓储
    DatabaseModule.forFeature([Work], DATABASE_CONNECTIONS.MAIN),
    // template 库的 Template 实体仓储
    DatabaseModule.forFeature([Template], DATABASE_CONNECTIONS.TEMPLATE),
  ],
  controllers: [AdminContentController],
  providers: [AdminContentService],
})
export class AdminContentModule {}
