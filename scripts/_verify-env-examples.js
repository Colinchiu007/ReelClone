// Task 11d 验证：交叉校验各服务 .env.example 与根权威模板一致性
const fs = require('fs')
const path = require('path')

const ROOT = 'D:/Data/projects/ReelClone'
const rootKeys = extractKeys(path.join(ROOT, '.env.example'))

function extractKeys(file) {
  const set = new Set()
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=/)
    if (m) set.add(m[1])
  }
  return set
}

// 允许的服务私有 key（合法存在于服务模板但不在根聚合模板）：
//  - *_PORT 服务专属端口、billing 客户端参数
//  - POINTS_* / ORDER_EXPIRE_* 当前仅写入 docker/.env.production.example 与 CI，暂未被代码强引用
//  - 小程序域配置（API_BASE_URL/WS_BASE_URL/DEBUG/分页/时长）归属 apps/miniprogram/config，非服务端 .env
const allowOrg = new Set([
  'BILLING_CLIENT_MAX_RETRIES',
  'BILLING_CLIENT_CB_THRESHOLD',
  'BILLING_CLIENT_CB_COOLDOWN_MS',
  'POINTS_BALANCE_CACHE_TTL',
  'POINTS_FROZEN_CACHE_TTL',
  'POINTS_IDEMPOTENCY_TTL',
  'ORDER_EXPIRE_MINUTES',
  'API_BASE_URL',
  'WS_BASE_URL',
  'DEBUG',
  'DEFAULT_PAGE_SIZE',
  'VIDEO_MAX_DURATION',
])

let fail = false
const svcFiles = fs
  .readdirSync(path.join(ROOT, 'apps'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(ROOT, 'apps', e.name, '.env.example'))
  .filter((f) => fs.existsSync(f))

for (const file of svcFiles) {
  const keys = extractKeys(file)
  const missing = [...keys].filter((k) => !rootKeys.has(k) && !allowOrg.has(k))
  console.log(`\n=== ${path.basename(path.dirname(file))} (${keys.size} keys) ===`)
  console.log('  覆盖根模板: OK')
  if (missing.length) {
    fail = true
    console.log('  缺少于根模板:')
    missing.forEach((k) => console.log('    ✗ ' + k))
  } else {
    console.log('  与根模板无缺失: ✓')
  }
}

console.log('\n========== ')
console.log(
  fail
    ? '✗ 存在服务模板变量未收录于根权威模板'
    : '✓ 全部服务 .env.example 均在根权威模板覆盖范围内',
)
process.exit(fail ? 1 : 0)
