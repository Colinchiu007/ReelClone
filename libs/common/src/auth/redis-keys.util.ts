/**
 * Redis Key 构建工具
 *
 * 统一管理认证相关的 Redis key 格式和构建函数。
 * 所有服务必须使用这些函数生成 key，确保跨服务一致性。
 */

/** jti 黑名单前缀（logout 后吊销 token） */
export const BLACKLIST_PREFIX = 'auth:blacklist:'

/** 密码修改标记前缀（改密后踢下线） */
export const PASSWORD_CHANGED_PREFIX = 'user:password-changed:'

/** Session Family 前缀（刷新轮换 + 复用检测） */
export const SESSION_FAMILY_PREFIX = 'auth:family:'

/** 用户所有 Family Set 前缀（用于凭证变更时批量吊销） */
export const USER_FAMILIES_PREFIX = 'auth:user-families:'

/** Token Version 缓存前缀（下游服务快速校验） */
export const TOKEN_VERSION_PREFIX = 'auth:tv:'

/** 构造 jti 黑名单 Redis key */
export function buildBlacklistKey(jti: string): string {
  return `${BLACKLIST_PREFIX}${jti}`
}

/** 构造"密码修改踢下线"Redis key */
export function buildPasswordChangedKey(userId: string): string {
  return `${PASSWORD_CHANGED_PREFIX}${userId}`
}

/** 构造 Session Family Redis key */
export function buildSessionFamilyKey(familyId: string): string {
  return `${SESSION_FAMILY_PREFIX}${familyId}`
}

/** 构造用户 Family Set Redis key */
export function buildUserFamiliesKey(userId: string): string {
  return `${USER_FAMILIES_PREFIX}${userId}`
}

/** 构造 Token Version 缓存 Redis key */
export function buildTokenVersionKey(userId: string): string {
  return `${TOKEN_VERSION_PREFIX}${userId}`
}
