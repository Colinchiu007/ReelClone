/**
 * AdminConfigModule — 系统配置管理模块
 *
 * 提供 API Key 运行时管理端点：
 *  - GET /admin/config/api-keys  查看各 Provider Key 状态
 *  - PUT /admin/config/api-keys  更新指定 Provider 的 Key 列表
 *
 * 依赖：
 *  - ConfigStoreModule（来自 @reelclone/common，提供 CONFIG_STORE_SERVICE Token）
 *  - ConfigModule（全局，提供 ConfigService 用于环境变量回退）
 *
 * 注意：此模块需在 app.module.ts 中统一注册（Task 后续步骤完成）。
 * 此模块不导出 AdminConfigService，仅供 Controller 使用。
 */
import { Module } from '@nestjs/common'
import { ConfigStoreModule } from '@reelclone/common'
import { AdminConfigController } from './admin-config.controller'
import { AdminConfigService } from './admin-config.service'

@Module({
  imports: [ConfigStoreModule],
  controllers: [AdminConfigController],
  providers: [AdminConfigService],
})
export class AdminConfigModule {}
