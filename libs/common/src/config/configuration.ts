/**
 * 全局配置工厂
 *
 * 汇总所有环境变量配置，供 ConfigModule.forRoot({ load: [configuration] }) 使用。
 * 也可直接调用 configuration() 获取完整配置对象。
 *
 * 子配置项可通过 registerAs 的命名空间注入，此处提供聚合视图。
 */
import type { DatabaseConfig } from './database.config'
import { resolveJwtSecret } from './jwt.config'
import type { JwtConfig } from './jwt.config'
import type { RedisConfig } from './redis.config'

/** 应用全局配置 */
export interface AppConfig {
  /** 运行环境 */
  env: {
    nodeEnv: string
    isProduction: boolean
    isDevelopment: boolean
    isTest: boolean
  }
  /** 数据库（4 连接） */
  database: DatabaseConfig
  /** Redis */
  redis: RedisConfig
  /** JWT */
  jwt: JwtConfig
  /** 微信小程序 */
  wechat: {
    appid: string
    secret: string
  }
  /** 微信支付 */
  wechatPay: {
    mchId: string
    serialNo: string
    privateKey: string
    apiV3Key: string
    notifyUrl: string
  }
  /** Seedance 视频 AI（逗号分隔多 Key） */
  seedance: {
    apiKeys: string[]
  }
  /** LLM 大语言模型 */
  llm: {
    apiKey: string
    provider: string
    baseUrl: string
    model: string
  }
  /** Temporal 工作流 */
  temporal: {
    address: string
    namespace: string
  }
  /** 日志 */
  log: {
    level: string
  }
}

/** 是否为生产环境 */
const isProduction = process.env.NODE_ENV === 'production'

/**
 * 从环境变量加载完整配置
 */
export function configuration(): AppConfig {
  return {
    env: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      isProduction,
      isDevelopment: process.env.NODE_ENV === 'development',
      isTest: process.env.NODE_ENV === 'test',
    },
    database: {
      main: {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
        username: process.env.DATABASE_USER ?? 'reelclone',
        password: process.env.DATABASE_PASSWORD ?? '',
        database: process.env.DATABASE_NAME ?? 'reelclone_main',
        schema: process.env.DATABASE_SCHEMA ?? 'public',
        synchronize: !isProduction,
        logging: !isProduction,
      },
      billing: {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
        username: process.env.DATABASE_USER ?? 'reelclone',
        password: process.env.DATABASE_PASSWORD ?? '',
        database: process.env.DATABASE_BILLING_NAME ?? 'reelclone_billing',
        schema: process.env.DATABASE_SCHEMA ?? 'public',
        synchronize: !isProduction,
        logging: !isProduction,
      },
      template: {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
        username: process.env.DATABASE_USER ?? 'reelclone',
        password: process.env.DATABASE_PASSWORD ?? '',
        database: process.env.DATABASE_TEMPLATE_NAME ?? 'reelclone_template',
        schema: process.env.DATABASE_SCHEMA ?? 'public',
        synchronize: !isProduction,
        logging: !isProduction,
      },
      benchmark: {
        host: process.env.DATABASE_HOST ?? 'localhost',
        port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
        username: process.env.DATABASE_USER ?? 'reelclone',
        password: process.env.DATABASE_PASSWORD ?? '',
        database: process.env.DATABASE_BENCHMARK_NAME ?? 'reelclone_benchmark',
        schema: process.env.DATABASE_SCHEMA ?? 'public',
        synchronize: !isProduction,
        logging: !isProduction,
      },
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB ?? '0', 10),
      keyPrefix: process.env.REDIS_PREFIX ?? 'reelclone:',
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT ?? '10000', 10),
      maxRetriesPerRequest: 3,
    },
    jwt: {
      secret: resolveJwtSecret(),
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      issuer: process.env.JWT_ISSUER ?? 'reelclone',
      audience: process.env.JWT_AUDIENCE ?? 'reelclone-client',
    },
    wechat: {
      appid: process.env.WECHAT_APPID ?? '',
      secret: process.env.WECHAT_SECRET ?? '',
    },
    wechatPay: {
      mchId: process.env.WECHAT_PAY_MCHID ?? '',
      serialNo: process.env.WECHAT_PAY_SERIAL_NO ?? '',
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY ?? '',
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY ?? '',
      notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL ?? '',
    },
    seedance: {
      apiKeys: (process.env.SEEDANCE_API_KEYS ?? '').split(',').filter(Boolean),
    },
    llm: {
      apiKey: process.env.LLM_API_KEY ?? '',
      provider: process.env.LLM_PROVIDER ?? 'openai',
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    },
    temporal: {
      address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
      namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    },
    log: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  }
}

export default configuration
