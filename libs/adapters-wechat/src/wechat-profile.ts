/**
 * 微信运行时 profile 解析（fail closed）
 *
 * 参考 libs/common/src/config/jwt.config.ts 中 resolveJwtSecret 的 fail closed 模式：
 *  - 显式测试 profile（NODE_ENV=test / RUNTIME_PROFILE=test / WECHAT_MOCK_MODE=true）→ 允许 Mock
 *  - 任意环境具备完整 WECHAT_APPID/WECHAT_SECRET → 使用 Real adapter
 *  - production/staging 缺凭证 → 抛错拒绝启动（fail closed）
 *  - 开发环境缺凭证 → 回退到 Mock（与 resolveJwtSecret 开发回退一致，便于本地联调）
 *
 * 此函数在 WechatAdapterModule 启动工厂中调用，任何 production/staging 下的缺凭证配置
 * 会在 NestJS provider 解析阶段抛错，从而阻止服务启动。
 */
import type { WechatRuntimeProfile } from './wechat-adapter.interface'

/** profile 解析结果 */
export interface WechatProfileResolution {
  /** 绑定的运行时 profile */
  profile: WechatRuntimeProfile
  /** 从环境变量读取的 appid（trimmed） */
  appid: string
  /** 从环境变量读取的 secret（trimmed） */
  secret: string
}

/**
 * 解析微信运行时 profile
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证时抛错
 */
export function resolveWechatProfile(
  env: NodeJS.ProcessEnv = process.env,
): WechatProfileResolution {
  const appid = (env.WECHAT_APPID ?? '').trim()
  const secret = (env.WECHAT_SECRET ?? '').trim()
  const hasCredentials = appid.length > 0 && secret.length > 0

  // 显式测试 profile 始终允许 Mock（不校验凭证）
  // 三种显式标注：NODE_ENV=test / RUNTIME_PROFILE=test / WECHAT_MOCK_MODE=true
  const isTestProfile =
    env.NODE_ENV === 'test' || env.RUNTIME_PROFILE === 'test' || env.WECHAT_MOCK_MODE === 'true'
  // production/staging 视为必须 fail closed 的环境
  const isProdOrStaging = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'

  if (isTestProfile) {
    return { profile: 'test', appid, secret }
  }

  if (hasCredentials) {
    return { profile: 'real', appid, secret }
  }

  if (isProdOrStaging) {
    throw new Error(
      'WECHAT_APPID/WECHAT_SECRET 环境变量未配置或为空，production/staging 环境拒绝启动（fail closed）',
    )
  }

  // 开发环境缺凭证：回退到 Mock（与 resolveJwtSecret 开发回退一致）
  return { profile: 'test', appid, secret }
}
