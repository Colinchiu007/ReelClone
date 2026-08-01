/**
 * SmsModule
 *
 * 在 NestJS 启动阶段根据运行时 profile 绑定具体 SmsAdapter 实现：
 *  - test profile        → MockSmsAdapter（仅开发/测试）
 *  - real + aliyun       → AliyunSmsAdapter（阿里云 dysmsapi）
 *  - real + tencent      → TencentSmsAdapter（腾讯云 sms.tencentcloudapi.com）
 *
 * 绑定决策由 resolveSmsProfile 完成（fail closed），
 * production/staging 缺凭证或启用 Mock 时工厂抛错，阻止服务启动。
 *
 * 业务模块只需 import 此模块并注入 SMS_ADAPTER，无需感知 mock/real/aliyun/tencent 分支。
 */
import { Module } from '@nestjs/common'
import { type SmsAdapter, SMS_ADAPTER } from './sms.adapter'
import { resolveSmsProfile } from './sms-profile'
import { MockSmsAdapter } from './mock-sms.adapter'
import { AliyunSmsAdapter } from './aliyun-sms.adapter'
import { TencentSmsAdapter } from './tencent-sms.adapter'

/**
 * 根据环境创建 SmsAdapter 实例
 *
 * 独立导出便于契约测试直接断言 fail-closed 行为与 provider 切换，无需启动 NestJS。
 *
 * @param env 环境变量对象，默认为 process.env
 * @throws production/staging 缺凭证或启用 Mock 时抛错
 */
export function createSmsAdapter(env: NodeJS.ProcessEnv = process.env): SmsAdapter {
  const resolution = resolveSmsProfile(env)

  if (resolution.profile === 'test') {
    return new MockSmsAdapter()
  }

  if (resolution.provider === 'tencent') {
    return new TencentSmsAdapter({
      secretId: resolution.tencentSecretId,
      secretKey: resolution.tencentSecretKey,
      sdkAppId: resolution.tencentSdkAppId,
      signName: resolution.tencentSignName,
    })
  }

  return new AliyunSmsAdapter({
    accessKeyId: resolution.aliyunAccessKeyId,
    accessKeySecret: resolution.aliyunAccessKeySecret,
    signName: resolution.aliyunSignName,
  })
}

@Module({
  providers: [
    {
      provide: SMS_ADAPTER,
      useFactory: (): SmsAdapter => createSmsAdapter(),
    },
  ],
  exports: [SMS_ADAPTER],
})
export class SmsModule {}
