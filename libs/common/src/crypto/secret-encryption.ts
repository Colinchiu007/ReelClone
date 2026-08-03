/**
 * Secret 加解密工具 — AES-256-GCM
 *
 * 用于 ConfigStoreService 对敏感配置值（API Key 等）进行应用层加密存储。
 * 格式：`enc:v1:{base64(iv + authTag + ciphertext)}`
 *
 * 密钥来源：环境变量 SECRET_ENCRYPTION_KEY（64 字符 hex = 32 字节）。
 * 未设置时所有操作透传（向后兼容，开发环境无需配置）。
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** 加密版本前缀 */
const ENCRYPTED_PREFIX = 'enc:v1:'

/** AES-256-GCM 参数 */
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/** 缓存解析后的密钥（进程生命周期内不变） */
let cachedKey: Buffer | null = null

/**
 * 获取加密密钥
 * @returns 32 字节 Buffer，未配置则返回 null
 */
function getEncryptionKey(): Buffer | null {
  if (cachedKey !== null) return cachedKey

  const hex = process.env.SECRET_ENCRYPTION_KEY
  if (!hex || hex.length === 0) return null

  if (hex.length !== 64) {
    throw new Error(`SECRET_ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${hex.length}`)
  }

  cachedKey = Buffer.from(hex, 'hex')
  return cachedKey
}

/**
 * 加密明文值
 * @param plaintext 明文
 * @returns 加密后字符串（带 `enc:v1:` 前缀），或原值（未配置密钥时）
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey()
  if (!key) return plaintext

  // 如果已经加密过，不重复加密
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext

  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  // 格式：iv(12) + authTag(16) + ciphertext → base64
  const payload = Buffer.concat([iv, authTag, encrypted])
  return `${ENCRYPTED_PREFIX}${payload.toString('base64')}`
}

/**
 * 解密密文值
 * @param storedValue 存储值（可能带 `enc:v1:` 前缀）
 * @returns 明文，或 null（解密失败）
 */
export function decryptSecret(storedValue: string): string {
  const key = getEncryptionKey()

  // 未加密的值直接返回（向后兼容旧数据）
  if (!storedValue.startsWith(ENCRYPTED_PREFIX)) return storedValue

  // 有前缀但无密钥 → 警告并返回原值（无法解密但不崩溃）
  if (!key) {
    console.warn(
      '[SecretEncryption] Received encrypted value but SECRET_ENCRYPTION_KEY is not set. ' +
        'Returning encrypted value as-is.',
    )
    return storedValue
  }

  try {
    const payload = Buffer.from(storedValue.slice(ENCRYPTED_PREFIX.length), 'base64')
    const iv = payload.subarray(0, IV_LENGTH)
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return decrypted.toString('utf8')
  } catch (err) {
    console.error(`[SecretEncryption] Failed to decrypt value: ${(err as Error).message}`)
    return storedValue
  }
}

/**
 * 检查值是否已加密
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX)
}

/**
 * 重置缓存的密钥（仅用于测试）
 */
export function resetEncryptionKeyCache(): void {
  cachedKey = null
}
