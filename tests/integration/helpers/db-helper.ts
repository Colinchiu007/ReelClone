/**
 * 数据库测试辅助
 *
 * 职责：
 *  - 直连 PostgreSQL（绕过服务），用于测试前清理 / 种子 / 验证
 *  - 提供按表清理、按用户清理、种子套餐等能力
 *
 * 默认连接配置对齐 docker/docker-compose.yml：
 *   host=localhost port=5432 user=reelclone password=reelclone_dev db=reelclone_main
 *
 * 可通过环境变量覆盖（DATABASE_HOST / DATABASE_PASSWORD 等）。
 *
 * 注意：本辅助仅在需要直连 DB 验证时使用。绝大多数断言应通过 API 完成，
 * 仅在需要验证「数据库副作用」或「幂等性落地」时才直连 DB。
 */
import { DataSource } from 'typeorm'

/** 数据库连接配置 */
export interface DbConfig {
  host: string
  port: number
  username: string
  password: string
  database: string
}

/** 从环境变量读取数据库配置 */
export function getDbConfig(): DbConfig {
  return {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? '5432'),
    username: process.env.DATABASE_USER ?? 'reelclone',
    password: process.env.DATABASE_PASSWORD ?? 'reelclone_dev',
    database: process.env.DATABASE_NAME ?? 'reelclone_main',
  }
}

/** main 库涉及的核心表（按清理顺序，先清理依赖方） */
const MAIN_TABLES = [
  'generation_tasks',
  'works',
  'notifications',
  'user_packages',
  'orders',
  'assets',
  'avatar_groups',
  'audit_log',
  'system_config',
  'sms_codes',
  'users',
  'packages',
]

/**
 * 创建并返回一个 TypeORM DataSource（不初始化）
 *
 * 调用方需自行 await ds.initialize() 与 ds.destroy()。
 * 推荐使用 withDb() 包裹。
 */
export function createDataSource(config: DbConfig = getDbConfig()): DataSource {
  return new DataSource({
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    schema: 'public',
    synchronize: false,
    logging: false,
  })
}

/**
 * 在事务中执行回调，自动管理 DataSource 生命周期
 *
 * @example
 * const pkg = await withDb(async (ds) => {
 *   return ds.query('SELECT id FROM package WHERE status=$1 LIMIT 1', ['ACTIVE']);
 * });
 */
export async function withDb<T>(fn: (ds: DataSource) => Promise<T>, config?: DbConfig): Promise<T> {
  const ds = createDataSource(config)
  try {
    await ds.initialize()
    return await fn(ds)
  } finally {
    if (ds.isInitialized) {
      await ds.destroy()
    }
  }
}

/**
 * 清理指定用户的所有数据（按依赖顺序删除）
 *
 * 用于测试前的隔离：每个测试套件用一个唯一 openId 登录，
 * 测试后清理该用户产生的所有数据，保证套件间互不影响。
 */
export async function cleanupUser(userId: string): Promise<void> {
  await withDb(async (ds) => {
    // main 库表（按外键依赖顺序删除）
    await ds.query(
      'DELETE FROM generation_tasks WHERE work_id IN (SELECT id FROM works WHERE user_id = $1)',
      [userId],
    )
    await ds.query('DELETE FROM works WHERE user_id = $1', [userId])
    await ds.query('DELETE FROM notifications WHERE user_id = $1', [userId])
    await ds.query('DELETE FROM user_packages WHERE user_id = $1', [userId])
    await ds.query('DELETE FROM orders WHERE user_id = $1', [userId])
    await ds.query('DELETE FROM assets WHERE user_id = $1', [userId])
    await ds.query('DELETE FROM avatar_groups WHERE user_id = $1', [userId])
    await ds.query(
      'DELETE FROM sms_codes WHERE mobile IN (SELECT mobile FROM users WHERE id = $1)',
      [userId],
    )
    await ds.query('DELETE FROM users WHERE id = $1', [userId])
  })
  // 跨库表（billing/benchmark/template）通过各自库连接清理
  await withDb(
    async (ds) => {
      await ds.query('DELETE FROM point_transactions WHERE user_id = $1', [userId])
    },
    { ...getDbConfig(), database: process.env.DATABASE_BILLING_NAME ?? 'reelclone_billing' },
  ).catch(() => {
    // billing 库清理失败不阻断（可能无数据）
  })
  await withDb(
    async (ds) => {
      await ds.query('DELETE FROM benchmarks WHERE user_id = $1', [userId])
    },
    { ...getDbConfig(), database: process.env.DATABASE_BENCHMARK_NAME ?? 'reelclone_benchmark' },
  ).catch(() => {
    // benchmark 库清理失败不阻断
  })
  await withDb(
    async (ds) => {
      await ds.query('DELETE FROM favorites WHERE user_id = $1', [userId])
    },
    { ...getDbConfig(), database: process.env.DATABASE_TEMPLATE_NAME ?? 'reelclone_template' },
  ).catch(() => {
    // template 库清理失败不阻断
  })
}

/**
 * 按 openId 清理用户（测试用 Mock 登录前调用，确保同 code 登录得到全新用户）
 */
export async function cleanupUserByOpenId(openId: string): Promise<void> {
  const userId = await withDb(async (ds) => {
    const rows = (await ds.query('SELECT id FROM users WHERE open_id = $1', [openId])) as Array<{
      id: string
    }>
    return rows[0]?.id
  })
  if (userId) {
    await cleanupUser(userId)
  }
}

/**
 * 清理全部表（谨慎使用，仅在全局 setup 时调用）
 *
 * 重置自增序列，确保测试从一个干净状态开始。
 * 注意：不清理 package 表（保留种子套餐）。
 */
export async function cleanupAllTables(): Promise<void> {
  await withDb(async (ds) => {
    for (const table of MAIN_TABLES) {
      if (table === 'packages') continue
      await ds.query(`DELETE FROM ${table}`)
    }
    // 重置序列
    await ds
      .query(`SELECT setval(pg_get_serial_sequence('"' || $1 || '"', 'id'), 1, false)`, ['users'])
      .catch(() => {
        // 序列重置失败不影响测试（部分表可能用 uuid 无序列）
      })
  })
}

// -------------------- 种子数据 --------------------

/** 种子套餐定义 */
export interface SeedPackage {
  id?: string
  name: string
  price: number
  points: number
  bonusPoints: number
  duration: number // 天
  status: string
  type: string // SUBSCRIPTION | ONE_TIME
  sort: number
}

/**
 * 种子套餐（测试依赖套餐存在的流程使用）
 *
 * - test_starter: 低价套餐，9.9 元 / 100 积分
 * - test_pro: 中档套餐，99 元 / 1200 积分（含 200 赠送）
 *
 * 使用 ON CONFLICT 保证可重复执行（幂等种子）。
 */
export async function seedPackages(): Promise<SeedPackage[]> {
  const packages: SeedPackage[] = [
    {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      name: '测试入门套餐',
      price: 9.9,
      points: 100,
      bonusPoints: 0,
      duration: 30,
      status: 'ACTIVE',
      type: 'SUBSCRIPTION',
      sort: 1,
    },
    {
      id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      name: '测试专业套餐',
      price: 99,
      points: 1000,
      bonusPoints: 200,
      duration: 30,
      status: 'ACTIVE',
      type: 'SUBSCRIPTION',
      sort: 2,
    },
  ]

  await withDb(async (ds) => {
    for (const pkg of packages) {
      await ds.query(
        `INSERT INTO packages (id, name, price, points, bonus_points, duration, status, type, sort, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           points = EXCLUDED.points,
           bonus_points = EXCLUDED.bonus_points,
           duration = EXCLUDED.duration,
           status = EXCLUDED.status,
           type = EXCLUDED.type,
           sort = EXCLUDED.sort`,
        [
          pkg.id,
          pkg.name,
          pkg.price,
          pkg.points,
          pkg.bonusPoints,
          pkg.duration,
          pkg.status,
          pkg.type,
          pkg.sort,
        ],
      )
    }
  })

  return packages
}

/**
 * 直接查询用户积分（绕过 API，验证数据库落地）
 */
export async function getUserPoints(userId: string): Promise<{
  currentPoints: number
  totalPoints: number
}> {
  return withDb(async (ds) => {
    const rows = (await ds.query('SELECT current_points, total_points FROM "users" WHERE id = $1', [
      userId,
    ])) as Array<{ current_points: string; total_points: string }>
    if (!rows[0]) {
      throw new Error(`用户不存在: ${userId}`)
    }
    return {
      currentPoints: Number(rows[0].current_points),
      totalPoints: Number(rows[0].total_points),
    }
  })
}

/**
 * 查询订单状态（绕过 API，验证幂等性落地）
 */
export async function getOrderStatus(
  orderNo: string,
): Promise<{ status: string; transactionId: string | null } | null> {
  return withDb(async (ds) => {
    const rows = (await ds.query('SELECT status, transaction_id FROM orders WHERE order_no = $1', [
      orderNo,
    ])) as Array<{ status: string; transaction_id: string | null }>
    return rows[0] ? { status: rows[0].status, transactionId: rows[0].transaction_id } : null
  })
}
