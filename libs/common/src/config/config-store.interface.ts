/**
 * ConfigStore 接口与注入 Token
 *
 * 用于解耦 ConfigStoreService 的实现与消费方。
 * 消费方（如 SeedanceProvider）通过 @Optional() @Inject(CONFIG_STORE_SERVICE)
 * 注入此接口的实现，无需强依赖 @reelclone/database。
 *
 * 当 ConfigStore 不可用时（未注入），消费方应回退到环境变量。
 */

/** ConfigStore 注入 Token（Symbol 保证全局唯一） */
export const CONFIG_STORE_SERVICE = Symbol('CONFIG_STORE_SERVICE')

/**
 * ConfigStore 服务接口
 *
 * 提供运行时配置读写能力，配合 Redis 缓存 + Pub/Sub 实现热刷新。
 */
export interface IConfigStore {
  /**
   * 读取配置原始值
   * @param key 配置键
   * @returns 配置值（未找到返回 null）
   */
  get(key: string): Promise<string | null>

  /**
   * 写入配置（同步 DB + Redis 缓存 + 发布 Pub/Sub 通知）
   * @param key 配置键
   * @param value 配置值
   */
  set(key: string, value: string): Promise<void>

  /**
   * 便捷方法：读取 API Key 数组（逗号分隔）
   * @param provider 服务名（如 seedance / llm / oss）
   * @returns Key 数组（去空后）
   */
  getApiKeys(provider: string): Promise<string[]>
}
