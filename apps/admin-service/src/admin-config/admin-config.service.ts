/**
 * AdminConfigService — 系统配置管理服务
 *
 * 职责：
 * - listApiKeys：查询各 Provider 的 Key 配置状态（不返回明文 Key）
 * - updateApiKeys：更新指定 Provider 的 Key 列表（调用 ConfigStoreService）
 *
 * 安全约束：
 * - API Key 永远不返回明文，仅返回 keyCount 与 hasKeys
 * - 所有操作需由 Controller 层 @Roles('ADMIN', 'SUPER_ADMIN') 守卫保护
 *
 * 数据源：
 * - ConfigStoreService（来自 @reelclone/common，注入 Token: CONFIG_STORE_SERVICE）
 * - 当 ConfigStore 不可用时，回退到环境变量读取（仅用于状态查询）
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CONFIG_STORE_SERVICE, type IConfigStore } from '@reelclone/common'
import type { ApiKeyProvider } from './dto/update-api-keys.dto'

/** 单个 Provider 的 Key 状态（不含明文） */
export interface ProviderKeyStatus {
  /** Provider 名称 */
  name: ApiKeyProvider
  /** Key 数量 */
  keyCount: number
  /** 是否已配置 */
  hasKeys: boolean
}

/** Key 列表查询响应 */
export interface ListApiKeysResult {
  providers: ProviderKeyStatus[]
}

/** 更新 Key 响应 */
export interface UpdateApiKeysResult {
  success: true
  provider: ApiKeyProvider
  keyCount: number
}

/** 受支持的 Provider 列表 */
const SUPPORTED_PROVIDERS: ApiKeyProvider[] = ['seedance', 'llm', 'oss']

/** Provider 对应的环境变量名（用于 ConfigStore 不可用时回退查询） */
const PROVIDER_ENV_MAP: Record<ApiKeyProvider, string> = {
  seedance: 'SEEDANCE_API_KEYS',
  llm: 'LLM_API_KEY',
  oss: 'OSS_ACCESS_KEY_ID',
}

@Injectable()
export class AdminConfigService {
  private readonly logger = new Logger(AdminConfigService.name)

  constructor(
    private readonly configService: ConfigService,
    @Inject(CONFIG_STORE_SERVICE) private readonly configStore: IConfigStore,
  ) {}

  // -------------------- GET /admin/config/api-keys --------------------

  /**
   * 查询各 Provider 的 Key 配置状态
   *
   * 返回每个 Provider 的 keyCount 和 hasKeys，**不返回明文 Key**。
   * 优先从 ConfigStore 读取，ConfigStore 不可用时回退到环境变量。
   */
  async listApiKeys(): Promise<ListApiKeysResult> {
    const providers: ProviderKeyStatus[] = []

    for (const provider of SUPPORTED_PROVIDERS) {
      const keys = await this.loadKeys(provider)
      providers.push({
        name: provider,
        keyCount: keys.length,
        hasKeys: keys.length > 0,
      })
    }

    return { providers }
  }

  // -------------------- PUT /admin/config/api-keys --------------------

  /**
   * 更新指定 Provider 的 Key 列表
   *
   * - 自动去除空字符串与首尾空白
   * - 调用 ConfigStoreService.set() 持久化到 DB + Redis 缓存 + 发布热刷新通知
   * - 返回更新后的 Key 数量
   *
   * @param provider 目标 Provider
   * @param keys Key 列表
   * @param operatorId 操作者 ID（用于审计日志）
   */
  async updateApiKeys(
    provider: ApiKeyProvider,
    keys: string[],
    operatorId?: string,
  ): Promise<UpdateApiKeysResult> {
    // 清洗输入：去首尾空白、过滤空字符串
    const cleanedKeys = (keys ?? [])
      .map((k) => (typeof k === 'string' ? k.trim() : ''))
      .filter((k) => k.length > 0)

    // 拼接为逗号分隔字符串存储
    const value = cleanedKeys.join(',')
    await this.configStore.set(this.providerConfigKey(provider), value)

    this.logger.log(
      `操作者 ${operatorId ?? 'unknown'} 更新 Provider=${provider} 的 API Key，共 ${cleanedKeys.length} 个`,
    )

    return {
      success: true,
      provider,
      keyCount: cleanedKeys.length,
    }
  }

  // -------------------- 内部方法 --------------------

  /** 加载指定 Provider 的 Key 列表（ConfigStore 优先，回退环境变量） */
  private async loadKeys(provider: ApiKeyProvider): Promise<string[]> {
    if (this.configStore) {
      try {
        const keys = await this.configStore.getApiKeys(provider)
        if (keys.length > 0) return keys
      } catch (err) {
        this.logger.warn(
          `从 ConfigStore 读取 Provider=${provider} Key 失败，回退到环境变量: ${(err as Error).message}`,
        )
      }
    }

    // 回退到环境变量
    const envValue = this.configService.get<string>(PROVIDER_ENV_MAP[provider]) ?? ''
    return envValue
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
  }

  /** Provider 名称到 DB 配置键的映射（与 ConfigStoreService 保持一致） */
  private providerConfigKey(provider: ApiKeyProvider): string {
    switch (provider) {
      case 'seedance':
        return 'seedance_api_keys'
      case 'llm':
        return 'llm_api_key'
      case 'oss':
        return 'oss_access_key_id'
      default:
        return `${provider}_api_keys`
    }
  }
}
