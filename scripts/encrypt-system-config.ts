/**
 * 一次性数据迁移脚本：加密 system_config 表中的明文值
 *
 * 使用方式：
 *   SECRET_ENCRYPTION_KEY=<hex32> npx ts-node scripts/encrypt-system-config.ts
 *
 * 环境变量 SECRET_ENCRYPTION_KEY 必须设置为 64 字符 hex（32 字节）。
 * 脚本会读取 system_config 表中所有未加密的值（不含 enc:v1: 前缀），
 * 加密后写回 DB。已加密的值会跳过。
 *
 * 幂等：可重复运行，已加密的值不受影响。
 */
import { DataSource } from 'typeorm'
import { createCipheriv, randomBytes } from 'node:crypto'
/* eslint-disable no-console */

const ENCRYPTED_PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const payload = Buffer.concat([iv, authTag, encrypted])
  return `${ENCRYPTED_PREFIX}${payload.toString('base64')}`
}

async function main() {
  const hex = process.env.SECRET_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    console.error('SECRET_ENCRYPTION_KEY must be set (64 hex characters)')
    process.exit(1)
  }
  const key = Buffer.from(hex, 'hex')

  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_MAIN_URL || process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  await ds.initialize()
  console.log('Connected to database')

  const rows = await ds.query('SELECT config_key, config_value FROM system_config')
  console.log(`Found ${rows.length} config rows`)

  let encrypted = 0
  let skipped = 0

  for (const row of rows) {
    if (row.config_value.startsWith(ENCRYPTED_PREFIX)) {
      skipped++
      continue
    }

    const encValue = encrypt(row.config_value, key)
    await ds.query('UPDATE system_config SET config_value = $1 WHERE config_key = $2', [
      encValue,
      row.config_key,
    ])
    encrypted++
    console.log(`  Encrypted: ${row.config_key}`)
  }

  console.log(`Done: ${encrypted} encrypted, ${skipped} skipped (already encrypted)`)
  await ds.destroy()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
