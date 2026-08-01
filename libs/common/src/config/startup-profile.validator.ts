/**
 * 启动阶段 profile 校验器（fail closed）。
 *
 * 在 NestFactory.create() 之前或之后调用，集中校验：
 * 1. NODE_ENV 已设置
 * 2. production/staging 不允许 TEMPORAL_MOCK_MODE=true
 * 3. production/staging 不允许显式 mock 标志
 * 4. JWT secret 在生产环境足够强
 *
 * 与各 adapter profile resolver（SMS/WeChat/OSS）互补：
 * adapter 在 Module 装配时校验自身凭证，本校验器做全局兜底。
 */

export interface ProfileValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** 判断是否为生产环境（与 SMS/WeChat profile resolver 一致）。 */
function isProductionLike(env: NodeJS.ProcessEnv): boolean {
  const nodeEnv = (env.NODE_ENV ?? 'development').toLowerCase()
  return nodeEnv === 'production' || nodeEnv === 'staging'
}

/**
 * 运行启动 profile 校验。
 * 返回校验结果（不抛错），由调用方决定是否 fail closed。
 */
export function validateStartupProfile(
  env: NodeJS.ProcessEnv = process.env,
): ProfileValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. NODE_ENV 应当已设置
  if (!env.NODE_ENV) {
    warnings.push('NODE_ENV 未设置，默认为 development')
  }

  const prod = isProductionLike(env)

  // 2. production/staging 不允许 TEMPORAL_MOCK_MODE=true
  if (prod && env.TEMPORAL_MOCK_MODE === 'true') {
    errors.push(
      'production/staging 环境禁止 TEMPORAL_MOCK_MODE=true。Temporal Activity 将使用 mock 数据，可能导致生产事故。',
    )
  }

  // 3. production/staging 不允许 SMS_MOCK_MODE=true
  if (prod && env.SMS_MOCK_MODE === 'true') {
    errors.push(
      'production/staging 环境禁止 SMS_MOCK_MODE=true。短信将使用 Mock 适配器，用户无法收到验证码。',
    )
  }

  // 4. production/staging 不允许 WECHAT_MOCK_MODE=true
  if (prod && env.WECHAT_MOCK_MODE === 'true') {
    errors.push(
      'production/staging 环境禁止 WECHAT_MOCK_MODE=true。微信登录将使用 Mock 适配器，用户无法登录。',
    )
  }

  // 5. JWT secret 校验（production/staging 必须 >= 32 字符）
  if (prod) {
    const jwtSecret = env.JWT_SECRET ?? ''
    if (jwtSecret.length < 32) {
      errors.push(
        `JWT_SECRET 长度不足（${jwtSecret.length}/32）。生产环境 JWT 签名需要至少 32 字符的密钥。`,
      )
    }
  }

  // 6. DATABASE_HOST 不应为 localhost（production/staging 警告）
  if (prod && env.DATABASE_HOST === 'localhost') {
    warnings.push(
      'DATABASE_HOST=localhost 在生产环境中疑似配置错误，请确认数据库连接地址。',
    )
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 校验并 fail closed：如果存在 error 级别问题，抛出异常阻止启动。
 * 调用方在 main.ts 中使用：
 * ```ts
 * failClosedStartupCheck() // 在 NestFactory.create() 之前
 * ```
 */
export function failClosedStartupCheck(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateStartupProfile(env)

  for (const warn of result.warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[StartupProfile] WARN: ${warn}`)
  }

  if (!result.ok) {
    const report = result.errors.join('\n  - ')
    throw new Error(
      `[StartupProfile] 启动校验失败（fail closed）：\n  - ${report}\n` +
        `请修正上述问题后重新启动。`,
    )
  }
}
