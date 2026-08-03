/** CacheModule Redis 客户端注入 Token — 定义在 common 内部，避免对 @reelclone/database 的依赖 */
export const CACHE_REDIS = Symbol('CACHE_REDIS')
