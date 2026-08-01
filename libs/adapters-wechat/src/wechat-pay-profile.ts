/**
 * 微信支付运行时 profile 解析（fail closed）
 *
 * 参考 libs/adapters-wechat/src/wechat-profile.ts 中 resolveWechatProfile 的 fail closed 模式：
 *  - 显式测试 profile（NODE_ENV=test 或 RUNTIME_PROFILE=test）→ 允许 Mock
 *  - 任意环境具备完整支付凭证（MCHID + API_V3_KEY + SERIAL_NO + PRIVATE_KEY）→ 使用 Real adapter
 *  - production/staging 缺凭证 → 抛错拒绝启动（fail closed）
 *  - 开发环境缺凭证 → 回退到 Mock（便于本地联调）
 *
 * 此函数在 WechatPayAdapterModule 启动工厂中调用，任何 production/staging 下的缺凭证配置
 * 会在 NestJS provider 解析阶段抛错，从而阻止服务启动。
 */
import type { WechatRuntimeProfile } from './wechat-adapter.interface'

/** profile 解析结果 */
export interface WechatPayProfileResolution {
  /** 绑定的运行时 profile */
  profile: WechatRuntimeProfile
  /** 从环境变量读取的商户号 */
  mchId: string
  /** 从环境变量读取的小程序 AppID */
  appId: string
  /** 从环境变量读取的 APIv3 密钥 */
  apiV3Key: string
  /** 从环境变量读取的商户证书序列号 */
  serialNo: string
  /** 从环境变量读取的商户私钥 PEM 内容 */
  privateKeyPem: string
  /** 从环境变量读取的商户私钥文件路径 */
  privateKeyPath: string
}

/**
 * 解析微信支付运行时 profile
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证时抛错
 */
export function resolveWechatPayProfile(
  env: NodeJS.ProcessEnv = process.env,
): WechatPayProfileResolution {
  const mchId = (env.WECHAT_PAY_MCHID ?? '').trim()
  const appId = (env.WECHAT_PAY_APPID ?? '').trim()
  const apiV3Key = (env.WECHAT_PAY_API_V3_KEY ?? '').trim()
  const serialNo = (env.WECHAT_PAY_SERIAL_NO ?? '').trim()
  const privateKeyPem = (env.WECHAT_PAY_PRIVATE_KEY_PEM ?? '').trim()
  const privateKeyPath = (env.WECHAT_PAY_PRIVATE_KEY_PATH ?? '').trim()

  const hasCredentials =
    mchId.length > 0 &&
    appId.length > 0 &&
    apiV3Key.length > 0 &&
    serialNo.length > 0 &&
    (privateKeyPem.length > 0 || privateKeyPath.length > 0)

  // 显式测试 profile 始终允许 Mock（不校验凭证）
  const isTestProfile = env.NODE_ENV === 'test' || env.RUNTIME_PROFILE === 'test'
  // production/staging 视为必须 fail closed 的环境
  const isProdOrStaging = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'

  if (isTestProfile) {
    return {
      profile: 'test',
      mchId,
      appId,
      apiV3Key,
      serialNo,
      privateKeyPem,
      privateKeyPath,
    }
  }

  if (hasCredentials) {
    return {
      profile: 'real',
      mchId,
      appId,
      apiV3Key,
      serialNo,
      privateKeyPem,
      privateKeyPath,
    }
  }

  if (isProdOrStaging) {
    throw new Error(
      '微信支付凭证未配置（WECHAT_PAY_MCHID/WECHAT_PAY_APPID/WECHAT_PAY_API_V3_KEY/WECHAT_PAY_SERIAL_NO/WECHAT_PAY_PRIVATE_KEY_PATH），production/staging 环境拒绝启动（fail closed）',
    )
  }

  // 开发环境缺凭证：回退到 Mock
  return {
    profile: 'test',
    mchId,
    appId,
    apiV3Key,
    serialNo,
    privateKeyPem,
    privateKeyPath,
  }
}
