/**
 * AdminConfigController — 系统配置管理控制器
 *
 * 路由前缀：api/v1/admin/config（由 main.ts 全局前缀 + Controller 前缀叠加）
 *
 * 端点：
 *  - GET /admin/config/api-keys  查看各 Provider Key 状态（不返回明文）
 *  - PUT /admin/config/api-keys  更新指定 Provider 的 Key 列表
 *
 * 权限：Controller 级别 @Roles('ADMIN', 'SUPER_ADMIN')，全局 JwtAuthGuard 已验证 JWT。
 *
 * 安全：
 *  - API Key 永远不返回明文，仅返回 keyCount 与 hasKeys
 *  - 更新操作会触发 ConfigStore 热刷新（通过 Redis Pub/Sub 通知所有实例）
 */
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common'
import { Roles, RolesGuard } from '@reelclone/common'
import { AdminConfigService } from './admin-config.service'
import { UpdateApiKeysDto } from './dto/update-api-keys.dto'

@Controller('admin/config')
@Roles('ADMIN', 'SUPER_ADMIN')
@UseGuards(RolesGuard)
export class AdminConfigController {
  constructor(private readonly adminConfigService: AdminConfigService) {}

  // -------------------- GET /admin/config/api-keys --------------------

  /**
   * 查看各 Provider 的 Key 配置状态
   *
   * 返回 { providers: [{ name, keyCount, hasKeys }, ...] }
   * **不返回明文 Key**，仅返回 Key 数量与是否已配置。
   */
  @Get('api-keys')
  async listApiKeys() {
    return this.adminConfigService.listApiKeys()
  }

  // -------------------- PUT /admin/config/api-keys --------------------

  /**
   * 更新指定 Provider 的 Key 列表
   *
   * body: { provider: 'seedance'|'llm'|'oss', keys: string[] }
   * 调用 ConfigStoreService.set() 持久化 + 发布热刷新通知。
   * 返回 { success: true, provider, keyCount }
   */
  @Put('api-keys')
  async updateApiKeys(@Body() dto: UpdateApiKeysDto) {
    return this.adminConfigService.updateApiKeys(dto.provider, dto.keys)
  }
}
