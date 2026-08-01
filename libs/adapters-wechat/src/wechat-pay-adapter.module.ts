/**
 * WechatPayAdapterModule
 *
 * 在 NestJS 启动阶段根据运行时 profile 绑定具体 IWechatPayAdapter 实现：
 *  - test profile → MockWechatPayAdapter
 *  - real profile → RealWechatPayAdapter(config)
 *
 * 绑定决策由 resolveWechatPayProfile 完成（fail closed），
 * production/staging 缺凭证时工厂抛错，阻止服务启动。
 *
 * production 环境下 RealWechatPayAdapter 创建后还会执行 runSelfTest()，
 * 未通过官方验签向量测试时 fail closed（拒绝启动）。
 *
 * 业务模块只需 import 此模块并注入 WECHAT_PAY_ADAPTER，无需感知 mock/real 分支。
 */
import { Module } from '@nestjs/common'
import { type IWechatPayAdapter, WECHAT_PAY_ADAPTER } from './wechat-pay-adapter.interface'
import { resolveWechatPayProfile } from './wechat-pay-profile'
import { MockWechatPayAdapter } from './mock-wechat-pay.adapter'
import { RealWechatPayAdapter } from './wechat-pay.adapter'

/**
 * 根据环境创建 IWechatPayAdapter 实例
 *
 * 独立导出便于契约测试直接断言 fail-closed 行为，无需启动 NestJS。
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证时抛错
 * @throws production 环境 self-test 失败时抛错
 */
export async function createWechatPayAdapter(
  env: NodeJS.ProcessEnv = process.env,
): Promise<IWechatPayAdapter> {
  const { profile, mchId, appId, apiV3Key, serialNo, privateKeyPem, privateKeyPath } =
    resolveWechatPayProfile(env)

  if (profile === 'test') {
    return new MockWechatPayAdapter()
  }

  const adapter = new RealWechatPayAdapter({
    mchId,
    appId,
    apiV3Key,
    serialNo,
    privateKeyPem: privateKeyPem || undefined,
    privateKeyPath: privateKeyPath || undefined,
  })

  // production 环境执行 fail-closed 自检
  if (env.NODE_ENV === 'production') {
    await adapter.runSelfTest()
  }

  return adapter
}

@Module({
  providers: [
    {
      provide: WECHAT_PAY_ADAPTER,
      useFactory: async (): Promise<IWechatPayAdapter> => createWechatPayAdapter(),
    },
  ],
  exports: [WECHAT_PAY_ADAPTER],
})
export class WechatPayAdapterModule {}
