/**
 * JWT 配置
 *
 * 通过环境变量 JWT_SECRET / JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN 配置。
 * 用于 JwtModule 注册和 JwtAuthGuard 验证。
 *
 * 使用方式：
 * ```ts
 * ConfigModule.forRoot({ load: [jwtConfig] })
 * JwtModule.registerAsync({
 *   inject: [jwtConfig.KEY],
 *   useFactory: (cfg: JwtConfig) => ({
 *     secret: cfg.secret,
 *     signOptions: { expiresIn: cfg.expiresIn },
 *   }),
 * })
 * ```
 */
import { registerAs } from '@nestjs/config'

/** JWT 配置 */
export interface JwtConfig {
  /** 签名密钥（至少 32 字符） */
  secret: string
  /** Access Token 过期时间（如 1h / 7d） */
  expiresIn: string
  /** Refresh Token 过期时间 */
  refreshExpiresIn: string
  /** Token 发行者 */
  issuer: string
  /** Token 受众 */
  audience: string
}

/** 开发环境默认密钥（仅用于本地启动，生产环境必须显式配置 JWT_SECRET） */
const DEV_FALLBACK_SECRET = 'reelclone_dev_secret_at_least_32_chars_long'

/**
 * 解析 JWT 密钥
 *
 * - 生产环境（NODE_ENV=production）：JWT_SECRET 必须显式配置且长度 ≥ 32，否则抛错拒绝启动
 * - 非生产环境：允许回退到开发密钥，便于本地联调与单元测试
 *
 * 此函数用于 jwtConfig 工厂与各微服务的 JwtModule/JwtStrategy 注册，
 * 避免任何路径下出现"生产环境使用硬编码密钥"的安全风险。
 *
 * @param env 环境变量对象，默认为 process.env
 */
export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.JWT_SECRET
  if (secret && secret.length >= 32) {
    return secret
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET 环境变量未配置或长度不足 32 字符，生产环境拒绝启动',
    )
  }
  return DEV_FALLBACK_SECRET
}

/**
 * JWT 配置工厂
 */
export const jwtConfig = registerAs('jwt', (): JwtConfig => ({
  secret: resolveJwtSecret(),
  expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  issuer: process.env.JWT_ISSUER ?? 'reelclone',
  audience: process.env.JWT_AUDIENCE ?? 'reelclone-client',
}))
