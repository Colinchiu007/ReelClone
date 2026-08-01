/**
 * 短信运行时 profile 解析（fail closed）
 *
 * 参考 libs/adapters-wechat/src/wechat-profile.ts 的 fail closed 模式，
 * 并支持通过 SMS_PROVIDER 环境变量在 aliyun / tencent 之间切换：
 *
 *  - 显式测试 profile（NODE_ENV=test 或 RUNTIME_PROFILE=test 或 SMS_MOCK_MODE=true 且非生产）
 *    → 允许 Mock（不校验凭证）
 *  - SMS_PROVIDER=aliyun（默认） + 完整阿里云凭证 → Real(阿里云)
 *  - SMS_PROVIDER=tencent + 完整腾讯云凭证 → Real(腾讯云)
 *  - production/staging 缺凭证 → 抛错拒绝启动（fail closed）
 *  - production/staging 显式 SMS_MOCK_MODE=true → 抛错拒绝启动（生产禁止 Mock）
 *  - production/staging SMS_PROVIDER=mock → 抛错拒绝启动
 *  - 开发环境缺凭证 / 显式 Mock → 回退到 Mock（便于本地联调）
 *
 * 此函数在 SmsModule 启动工厂中调用，任何 production/staging 下的缺凭证或 Mock 配置
 * 会在 NestJS provider 解析阶段抛错，从而阻止服务启动。
 */
import type { SmsProvider, SmsRuntimeProfile } from './sms.adapter'

/** profile 解析结果 */
export interface SmsProfileResolution {
  /** 绑定的运行时 profile */
  profile: SmsRuntimeProfile
  /** 选择的 SMS provider（仅 real profile 有意义） */
  provider: SmsProvider
  /** 阿里云 AccessKeyId（trimmed） */
  aliyunAccessKeyId: string
  /** 阿里云 AccessKeySecret（trimmed） */
  aliyunAccessKeySecret: string
  /** 阿里云短信签名（trimmed） */
  aliyunSignName: string
  /** 腾讯云 SecretId（trimmed） */
  tencentSecretId: string
  /** 腾讯云 SecretKey（trimmed） */
  tencentSecretKey: string
  /** 腾讯云短信 SdkAppId（trimmed） */
  tencentSdkAppId: string
  /** 腾讯云短信签名（trimmed） */
  tencentSignName: string
}

/**
 * 解析短信运行时 profile
 *
 * 环境变量：
 *  - SMS_PROVIDER: 'aliyun' | 'tencent'（默认 aliyun；'mock' 仅在测试 profile 下允许）
 *  - SMS_MOCK_MODE: 'true' 时强制 Mock（仅开发环境生效）
 *  - SMS_ALIYUN_ACCESS_KEY_ID / SMS_ALIYUN_ACCESS_KEY_SECRET / SMS_ALIYUN_SIGN_NAME
 *  - SMS_TENCENT_SECRET_ID / SMS_TENCENT_SECRET_KEY / SMS_TENCENT_SDK_APP_ID / SMS_TENCENT_SIGN_NAME
 *  - NODE_ENV / RUNTIME_PROFILE
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证或启用 Mock 时抛错
 */
export function resolveSmsProfile(env: NodeJS.ProcessEnv = process.env): SmsProfileResolution {
  const aliyunAccessKeyId = (env.SMS_ALIYUN_ACCESS_KEY_ID ?? '').trim()
  const aliyunAccessKeySecret = (env.SMS_ALIYUN_ACCESS_KEY_SECRET ?? '').trim()
  const aliyunSignName = (env.SMS_ALIYUN_SIGN_NAME ?? '').trim()
  const tencentSecretId = (env.SMS_TENCENT_SECRET_ID ?? '').trim()
  const tencentSecretKey = (env.SMS_TENCENT_SECRET_KEY ?? '').trim()
  const tencentSdkAppId = (env.SMS_TENCENT_SDK_APP_ID ?? '').trim()
  const tencentSignName = (env.SMS_TENCENT_SIGN_NAME ?? '').trim()

  const rawProvider = (env.SMS_PROVIDER ?? 'aliyun').trim().toLowerCase()
  const mockMode = env.SMS_MOCK_MODE === 'true'

  // 显式测试 profile 始终允许 Mock（不校验凭证）
  const isTestProfile =
    env.NODE_ENV === 'test' ||
    env.RUNTIME_PROFILE === 'test' ||
    // SMS_PROVIDER=mock 仅在测试 profile 下被识别为 Mock（生产在下方 fail closed）
    (rawProvider === 'mock' && env.NODE_ENV !== 'production' && env.NODE_ENV !== 'staging')
  // production/staging 视为必须 fail closed 的环境
  const isProdOrStaging = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'

  // production/staging 显式启用 Mock → 拒绝启动
  if (isProdOrStaging && mockMode) {
    throw new Error(
      'SMS_MOCK_MODE=true 在 production/staging 环境不被允许，请配置真实 SMS 凭证并关闭 Mock（fail closed）',
    )
  }
  // production/staging 显式 SMS_PROVIDER=mock → 拒绝启动
  if (isProdOrStaging && rawProvider === 'mock') {
    throw new Error(
      'SMS_PROVIDER=mock 在 production/staging 环境不被允许，请配置 SMS_PROVIDER=aliyun|tencent 并提供完整凭证（fail closed）',
    )
  }

  // 显式测试 profile 始终允许 Mock
  if (isTestProfile) {
    return {
      profile: 'test',
      provider: 'aliyun',
      aliyunAccessKeyId,
      aliyunAccessKeySecret,
      aliyunSignName,
      tencentSecretId,
      tencentSecretKey,
      tencentSdkAppId,
      tencentSignName,
    }
  }

  // real profile：根据 SMS_PROVIDER 选择 provider 并校验对应凭证
  const provider: SmsProvider = rawProvider === 'tencent' ? 'tencent' : 'aliyun'

  if (provider === 'tencent') {
    const hasTencentCredentials =
      tencentSecretId.length > 0 && tencentSecretKey.length > 0 && tencentSdkAppId.length > 0
    if (hasTencentCredentials) {
      return {
        profile: 'real',
        provider: 'tencent',
        aliyunAccessKeyId,
        aliyunAccessKeySecret,
        aliyunSignName,
        tencentSecretId,
        tencentSecretKey,
        tencentSdkAppId,
        tencentSignName,
      }
    }
    // production/staging 缺腾讯云凭证 → fail closed
    if (isProdOrStaging) {
      throw new Error(
        'SMS_TENCENT_SECRET_ID/SMS_TENCENT_SECRET_KEY/SMS_TENCENT_SDK_APP_ID 环境变量未配置或为空，production/staging 环境拒绝启动（fail closed）',
      )
    }
  } else {
    const hasAliyunCredentials = aliyunAccessKeyId.length > 0 && aliyunAccessKeySecret.length > 0
    if (hasAliyunCredentials) {
      return {
        profile: 'real',
        provider: 'aliyun',
        aliyunAccessKeyId,
        aliyunAccessKeySecret,
        aliyunSignName,
        tencentSecretId,
        tencentSecretKey,
        tencentSdkAppId,
        tencentSignName,
      }
    }
    // production/staging 缺阿里云凭证 → fail closed
    if (isProdOrStaging) {
      throw new Error(
        'SMS_ALIYUN_ACCESS_KEY_ID/SMS_ALIYUN_ACCESS_KEY_SECRET 环境变量未配置或为空，production/staging 环境拒绝启动（fail closed）',
      )
    }
  }

  // 开发环境缺凭证 或 显式 Mock → 回退到 Mock（与 wechat-profile 开发回退一致）
  return {
    profile: 'test',
    provider: 'aliyun',
    aliyunAccessKeyId,
    aliyunAccessKeySecret,
    aliyunSignName,
    tencentSecretId,
    tencentSecretKey,
    tencentSdkAppId,
    tencentSignName,
  }
}
