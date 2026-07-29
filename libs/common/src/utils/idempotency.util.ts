/**
 * 幂等键工具
 *
 * 用于接口幂等控制：客户端可通过 `x-idempotency-key` header 传入自定义幂等键，
 * 也可由服务端根据「用户 + 动作 + 载荷」自动生成。
 * 配合 Redis 存储幂等键与响应结果，可在重试时返回首次结果，避免重复执行。
 */

/** 幂等键在 HTTP header 中的字段名 */
export const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key'

/** 幂等键 Redis 存储前缀 */
export const IDEMPOTENCY_REDIS_PREFIX = 'idem'

/** header 宽松类型 */
type HeaderBag = Record<string, string | string[] | undefined>

/**
 * 从请求 header 中提取幂等键
 * @param headers 请求头对象
 * @returns 幂等键字符串，若未提供则返回 undefined
 */
export function extractIdempotencyKey(headers: HeaderBag): string | undefined {
  const raw = headers[IDEMPOTENCY_KEY_HEADER] ?? headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim()
  }
  return undefined
}

/**
 * 生成幂等键
 *
 * 格式：`idem:{userId}:{action}:{payloadHash}:{timestamp}`
 * 其中 payloadHash 基于 djb2 算法对载荷 JSON 计算摘要，保证相同输入生成相同前缀。
 * @param userId 用户 ID
 * @param action 业务动作标识（如 `create_video`）
 * @param payload 业务载荷，参与哈希计算
 * @returns 幂等键字符串
 */
export function generateIdempotencyKey(
  userId: string,
  action: string,
  payload?: Record<string, unknown>,
): string {
  const payloadHash = payload ? hashPayload(JSON.stringify(payload)) : 'nopayload'
  const timestamp = Date.now()
  return `${IDEMPOTENCY_REDIS_PREFIX}:${userId}:${action}:${payloadHash}:${timestamp}`
}

/**
 * 构建 Redis 中存储幂等结果的 key
 * @param idempotencyKey 幂等键
 * @returns Redis key
 */
export function buildIdempotencyRedisKey(idempotencyKey: string): string {
  return `${IDEMPOTENCY_REDIS_PREFIX}:result:${idempotencyKey}`
}

/**
 * djb2 字符串哈希算法
 * 简单高效，适用于幂等键生成中的载荷摘要（非安全用途）
 */
function hashPayload(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}
