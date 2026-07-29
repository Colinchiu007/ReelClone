/**
 * 数据库配置
 *
 * ReelClone 采用 PostgreSQL 16 单实例多库架构，共 4 个业务数据库：
 *  - reelclone_main      用户 / 资产 / 作品 / 订单
 *  - reelclone_billing   积分流水 / 账本
 *  - reelclone_template  模板 / 推荐
 *  - reelclone_benchmark 对标解析
 *
 * 使用 @nestjs/config 的 registerAs 注册命名空间配置：
 * ```ts
 * ConfigModule.forRoot({ load: [databaseConfig] })
 * // 注入：@Inject(databaseConfig.KEY) private dbConfig: DatabaseConfig
 * ```
 */
import { registerAs } from '@nestjs/config'

/** 单个数据库连接配置 */
export interface DatabaseConnectionConfig {
  /** 主机地址 */
  host: string
  /** 端口 */
  port: number
  /** 用户名 */
  username: string
  /** 密码 */
  password: string
  /** 数据库名 */
  database: string
  /** schema */
  schema: string
  /** 是否自动同步实体结构（仅开发环境） */
  synchronize: boolean
  /** 是否开启 SQL 日志（仅开发环境） */
  logging: boolean
}

/** 数据库集群配置（4 个连接） */
export interface DatabaseConfig {
  /** 主库：用户 / 资产 / 作品 / 订单 */
  main: DatabaseConnectionConfig
  /** 计费库：积分流水 / 账本 */
  billing: DatabaseConnectionConfig
  /** 模板库：模板 / 推荐 */
  template: DatabaseConnectionConfig
  /** 对标库：对标解析 */
  benchmark: DatabaseConnectionConfig
}

/** 是否为生产环境 */
const isProduction = process.env.NODE_ENV === 'production'

/**
 * 数据库配置工厂
 * 通过环境变量 DATABASE_HOST / DATABASE_PORT / DATABASE_USER / DATABASE_PASSWORD 配置
 */
export const databaseConfig = registerAs('database', (): DatabaseConfig => {
  const common = {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'reelclone',
    password: process.env.DATABASE_PASSWORD ?? '',
    schema: process.env.DATABASE_SCHEMA ?? 'public',
    synchronize: !isProduction,
    logging: !isProduction,
  }

  return {
    main: {
      ...common,
      database: process.env.DATABASE_NAME ?? 'reelclone_main',
    },
    billing: {
      ...common,
      database: process.env.DATABASE_BILLING_NAME ?? 'reelclone_billing',
    },
    template: {
      ...common,
      database: process.env.DATABASE_TEMPLATE_NAME ?? 'reelclone_template',
    },
    benchmark: {
      ...common,
      database: process.env.DATABASE_BENCHMARK_NAME ?? 'reelclone_benchmark',
    },
  }
})
