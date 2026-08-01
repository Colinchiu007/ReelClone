/**
 * WechatAdapterModule
 *
 * 在 NestJS 启动阶段根据运行时 profile 绑定具体 WechatAdapter 实现：
 *  - test profile → MockWechatAdapter
 *  - real profile → RealWechatAdapter(appid, secret)
 *
 * 绑定决策由 resolveWechatProfile 完成（fail closed），
 * production/staging 缺凭证时工厂抛错，阻止服务启动。
 *
 * 业务模块只需 import 此模块并注入 WECHAT_ADAPTER，无需感知 mock/real 分支。
 */
import { Module } from '@nestjs/common'
import { type WechatAdapter, WECHAT_ADAPTER } from './wechat-adapter.interface'
import { resolveWechatProfile } from './wechat-profile'
import { MockWechatAdapter } from './mock-wechat.adapter'
import { RealWechatAdapter } from './real-wechat.adapter'

/**
 * 根据环境创建 WechatAdapter 实例
 *
 * 独立导出便于契约测试直接断言 fail-closed 行为，无需启动 NestJS。
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证时抛错
 */
export function createWechatAdapter(env: NodeJS.ProcessEnv = process.env): WechatAdapter {
  const { profile, appid, secret } = resolveWechatProfile(env)
  if (profile === 'test') {
    return new MockWechatAdapter()
  }
  return new RealWechatAdapter(appid, secret)
}

@Module({
  providers: [
    {
      provide: WECHAT_ADAPTER,
      useFactory: (): WechatAdapter => createWechatAdapter(),
    },
  ],
  exports: [WECHAT_ADAPTER],
})
export class WechatAdapterModule {}
