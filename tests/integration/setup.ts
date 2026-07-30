/**
 * 测试环境初始化（setupFilesAfterEnv）
 *
 * 在每个测试文件执行前运行一次，职责：
 *  1. 校验 Mock 模式环境变量（防止误打真实微信 / 支付 / Temporal）
 *  2. 校验数据库连接可用（清理残留数据）
 *  3. 种子套餐数据（订单 / 积分流程依赖）
 *  4. 健康检查所有依赖的微服务（确保已启动）
 *
 * 若环境不满足，快速失败并给出清晰指引，避免后续测试全部报错。
 */
import { SERVICE_BASE_URL } from './helpers/test-client'
import { cleanupAllTables, seedPackages, withDb } from './helpers/db-helper'
import { waitForHealthy } from './helpers/wait'

/** 是否跳过服务健康检查（CI 中服务可能由外部编排启动） */
const SKIP_HEALTH_CHECK = process.env.E2E_SKIP_HEALTH_CHECK === 'true'

/** 是否跳过数据库清理（手动指定保留数据） */
const SKIP_DB_CLEANUP = process.env.E2E_SKIP_DB_CLEANUP === 'true'

/** Mock 模式必须为 true 的环境变量 */
const REQUIRED_MOCK_VARS = [
  'WECHAT_MOCK_MODE',
  'SMS_MOCK_MODE',
  'WECHAT_PAY_MOCK_MODE',
  'TEMPORAL_MOCK_MODE',
]

/** 各服务的 health 端点 */
const SERVICE_HEALTH_ENDPOINTS: Array<{ name: string; url: string }> = [
  { name: 'auth', url: `${SERVICE_BASE_URL.auth}/api/v1/auth/health` },
  { name: 'user', url: `${SERVICE_BASE_URL.user}/api/v1/users/health` },
  { name: 'asset', url: `${SERVICE_BASE_URL.asset}/api/v1/assets/health` },
  { name: 'benchmark', url: `${SERVICE_BASE_URL.benchmark}/api/v1/benchmarks/health` },
  { name: 'billing', url: `${SERVICE_BASE_URL.billing}/api/v1/points/health` },
  { name: 'workbench', url: `${SERVICE_BASE_URL.workbench}/api/v1/works/health` },
  { name: 'notification', url: `${SERVICE_BASE_URL.notification}/api/v1/notifications/health` },
  { name: 'order', url: `${SERVICE_BASE_URL.order}/api/v1/orders/health` },
]

/** 简易彩色日志（避免引入额外依赖） */
function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n[setup] ${message}`)
}

/**
 * 校验 Mock 模式环境变量
 *
 * 注意：环境变量需在「服务进程」侧设置，测试进程仅作提示。
 * 若测试进程读到的值非 true，说明可能漏配，给出警告（不阻断，
 * 因为服务可能通过 .env 文件加载而非进程环境变量）。
 */
function checkMockMode(): void {
  const warnings: string[] = []
  for (const varName of REQUIRED_MOCK_VARS) {
    if (process.env[varName] !== 'true') {
      warnings.push(varName)
    }
  }
  if (warnings.length > 0) {
    log(`⚠️  测试进程未检测到以下 Mock 变量（请确认服务侧已配置）：${warnings.join(', ')}`)
    log('   若服务通过 .env 文件加载，可忽略此警告；否则测试可能调用真实第三方接口。')
  } else {
    log('✅ Mock 模式环境变量已确认')
  }
}

/**
 * 校验数据库连接并清理残留数据
 */
async function checkAndCleanDb(): Promise<void> {
  try {
    await withDb(async (ds) => {
      const result = (await ds.query('SELECT 1 as ok')) as Array<{
        ok: number
      }>
      if (result[0]?.ok !== 1) {
        throw new Error('SELECT 1 未返回预期结果')
      }
    })
    log('✅ 数据库连接正常')

    if (!SKIP_DB_CLEANUP) {
      await cleanupAllTables()
      log('✅ 数据库残留数据已清理（保留 package 表）')
    } else {
      log('⏭️  跳过数据库清理（E2E_SKIP_DB_CLEANUP=true）')
    }
  } catch (err) {
    throw new Error(
      `数据库连接失败，请确认 PostgreSQL 已启动（docker compose -f docker/docker-compose.yml up -d）。\n` +
        `错误: ${(err as Error).message}`,
    )
  }
}

/**
 * 种子套餐数据
 */
async function seedData(): Promise<void> {
  if (SKIP_DB_CLEANUP) {
    log('⏭️  跳过种子数据（保留现有 package）')
    return
  }
  await seedPackages()
  log('✅ 种子套餐数据已就绪')
}

/**
 * 健康检查所有微服务
 *
 * 任何一个服务未就绪都会导致后续测试失败，提前检查可给出清晰错误。
 * 部分服务可能未实现 /health 端点，这里容忍 404（说明服务在响应）。
 */
async function checkServicesHealth(): Promise<void> {
  if (SKIP_HEALTH_CHECK) {
    log('⏭️  跳过服务健康检查（E2E_SKIP_HEALTH_CHECK=true）')
    return
  }

  log('🔍 检查微服务健康状态...')
  const failed: string[] = []

  for (const { name, url } of SERVICE_HEALTH_ENDPOINTS) {
    try {
      await waitForHealthy(url, 30000)
      log(`  ✅ ${name} 服务就绪`)
    } catch {
      // 退一步：尝试直接 TCP 连接，区分「服务未启动」与「无 /health 端点」
      try {
        const resp = await fetch(url).catch(() => null)
        if (resp && (resp.status === 404 || resp.status === 401)) {
          log(`  ✅ ${name} 服务已响应（${resp.status}，可能未实现 /health）`)
          continue
        }
      } catch {
        // 忽略，归入失败
      }
      failed.push(name)
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `以下服务未就绪: ${failed.join(', ')}\n` +
        '请启动所有微服务，或设置 E2E_SKIP_HEALTH_CHECK=true 跳过检查。',
    )
  }
  log('✅ 所有微服务就绪')
}

/**
 * 全局 setup（每个测试文件前执行）
 *
 * 由 jest setupFilesAfterEnv 调用并 await，无需手动执行。
 */
export default async function setup(): Promise<void> {
  log('=== ReelClone E2E 测试环境初始化 ===')

  checkMockMode()
  await checkAndCleanDb()
  await seedData()
  await checkServicesHealth()

  log('=== 初始化完成，开始执行测试 ===\n')
}
